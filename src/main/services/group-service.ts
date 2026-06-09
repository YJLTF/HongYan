import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { cryptoService } from '../crypto/crypto-service'
import { storageService } from '../storage/storage-service'
import { udpBroadcaster } from '../network/udp-broadcaster'
import { sendToPeer } from '../network/connection-manager'
import { createPacket } from '../network/protocol'
import { getDataDir } from '../storage/database'
import {
  generateGroupKey,
  encryptGroupKeyPayload,
  decryptGroupKeyPayload,
  registerGroupKey,
  getGroupKey,
  getCurrentGroupKey,
  dropGroupKeys,
  markPendingKeyDelivery,
  clearPendingKeyDelivery,
  getPendingKeyDeliveries,
  encryptWithGroupKey,
  decryptWithGroupKey,
} from '../crypto/group-key-manager'
import { pushGroupCreated, pushGroupUpdated, pushGroupDissolved, pushGroupInviteReceived, pushGroupInviteResponded, pushGroupMemberChanged, pushGroupMessageReceived, pushGroupMessageStatusUpdated } from '../ipc/ipc-push'
import {
  GROUP_ID_PREFIX,
  MAX_GROUP_MEMBERS,
} from '@shared/constants'
import {
  GROUP_PROTOCOL_VERSION,
  GROUP_PACKET_KINDS,
} from '@shared/types'
import { FILES_DIR } from '@shared/constants'
import type {
  IGroupService,
  Group,
  GroupMember,
  GroupMemberSnapshot,
  GroupCreatePacket,
  GroupInvitePacket,
  GroupJoinAcceptPacket,
  GroupInviteRejectPacket,
  GroupLeavePacket,
  GroupKickPacket,
  GroupDismissPacket,
  GroupUpdatePacket,
  GroupUpdateType,
  GroupMessagePacket,
  GroupMessageAckPacket,
  GroupMessageReadPacket,
  GroupRecallPacket,
  ChatRecord,
  Friend,
  EncryptedData,
} from '@shared/types'
import { GroupRole, ConversationType, MessageType, MessageStatus } from '@shared/types'
import log from 'electron-log'

class GroupService implements IGroupService {
  private selfPeerId(): string {
    return storageService.loadConfig()?.peerId || ''
  }

  private selfNickname(): string {
    return storageService.loadConfig()?.nickname || 'User'
  }

  private selfAvatar(): string | undefined {
    return storageService.loadConfig()?.avatar
  }

  private newGroupId(): string {
    return GROUP_ID_PREFIX + crypto.randomUUID()
  }

  // 在线成员（包含自己）
  private onlineMembers(group: Group): GroupMember[] {
    return group.members.filter(m => {
      if (m.peerId === this.selfPeerId()) return true
      const f = udpBroadcaster.getFriend(m.peerId)
      return f?.online === true
    })
  }

  // V1.4.0 修复：群密钥在内存中丢失（重启 / 老群）时自动向 owner 重同步
  private pendingKeyResyncs = new Map<string, {
    groupId: string
    resolve: (result: { key: Buffer | null; reason?: string }) => void
    timeout: NodeJS.Timeout
  }>()

  private async ensureGroupKey(groupId: string): Promise<Buffer> {
    let key = getCurrentGroupKey(groupId)
    if (key) return key

    const group = storageService.getGroup(groupId)
    if (!group) {
      throw new Error(`No group key available (group ${groupId} not found locally)`)
    }
    const selfId = this.selfPeerId()
    if (group.ownerPeerId === selfId) {
      throw new Error('No group key available (you are the owner but lost the key — please leave the group and re-create it)')
    }

    log.warn(`[KeyResync] No local key for ${groupId}, requesting from owner ${group.ownerPeerId}...`)
    const result = await this.requestGroupKeyFromOwner(groupId)
    if (result.key) {
      log.info(`[KeyResync] Resync successful for ${groupId}`)
      return result.key
    }

    // 给用户明确的可读错误，而不是模糊的"未响应"
    const reasonMap: Record<string, string> = {
      'self-is-owner': 'you are the owner (handled above)',
      'owner-not-in-friend-list': `owner ${group.ownerPeerId} is not in your friend list`,
      'owner-offline': `owner ${group.ownerPeerId} is offline`,
      'session-key-failed': `session key with owner ${group.ownerPeerId} could not be established`,
      'send-failed': `failed to send resync request to owner ${group.ownerPeerId}`,
      'timeout': `owner ${group.ownerPeerId} did not respond within 10s`,
      'owner-nack-no-key': `owner ${group.ownerPeerId} also lost the key (this group was created before the persistence fix was deployed) — please re-create the group to recover`,
    }
    const reasonText = result.reason ? reasonMap[result.reason] || result.reason : 'unknown'
    throw new Error(`No group key available: ${reasonText}`)
  }

  private async requestGroupKeyFromOwner(groupId: string): Promise<{ key: Buffer | null; reason?: string }> {
    const group = storageService.getGroup(groupId)
    if (!group) return { key: null, reason: 'group-not-found' }
    const selfId = this.selfPeerId()
    if (group.ownerPeerId === selfId) return { key: null, reason: 'self-is-owner' }

    const owner = udpBroadcaster.getFriend(group.ownerPeerId)
    if (!owner) {
      log.warn(`[KeyResync] Owner ${group.ownerPeerId} not in friend list`)
      return { key: null, reason: 'owner-not-in-friend-list' }
    }
    if (!owner.online) {
      log.warn(`[KeyResync] Owner ${group.ownerPeerId} is in friend list but offline`)
      return { key: null, reason: 'owner-offline' }
    }

    try {
      await this.ensureSessionKey(group.ownerPeerId)
    } catch (err) {
      log.warn(`[KeyResync] Failed to establish session key with owner ${group.ownerPeerId}: ${err}`)
      return { key: null, reason: 'session-key-failed' }
    }

    const requestId = crypto.randomUUID()
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingKeyResyncs.delete(requestId)
        log.warn(`[KeyResync] Timeout waiting for owner ${group.ownerPeerId} (group ${groupId})`)
        resolve({ key: null, reason: 'timeout' })
      }, 10000)

      this.pendingKeyResyncs.set(requestId, { groupId, resolve, timeout })

      const request = {
        type: 'req',
        requestId,
        groupId,
        fromPeerId: selfId,
        timestamp: Date.now(),
      }
      const encrypted = cryptoService.encryptForTransmission(group.ownerPeerId, JSON.stringify(request))
      sendToPeer(owner, createPacket(GROUP_PACKET_KINDS.KEY_RESYNC, {
        fromPeerId: selfId,
        encrypted,
      })).then(() => {
        log.info(`[KeyResync] Sent key resync request to ${group.ownerPeerId} for group ${groupId}`)
      }).catch((err) => {
        log.error(`[KeyResync] Failed to send key resync request: ${err}`)
        clearTimeout(timeout)
        this.pendingKeyResyncs.delete(requestId)
        resolve({ key: null, reason: 'send-failed' })
      })
    })
  }

  handleKeyResync(data: any, fromPeerId: string): void {
    try {
      const peerId = (data?.fromPeerId as string) || fromPeerId
      const encrypted = data?.encrypted
      if (!encrypted) {
        log.warn('Key resync: no encrypted payload')
        return
      }
      const decrypted = cryptoService.decryptFromTransmission(peerId, encrypted)
      const payload = JSON.parse(decrypted) as {
        type: string
        requestId: string
        groupId: string
        keyVersion?: number
        groupKey?: string
        error?: string
        timestamp: number
      }

      if (payload.type === 'resp') {
        this.handleKeyResyncResponse(payload, peerId)
        return
      }

      const group = storageService.getGroup(payload.groupId)
      if (!group) {
        log.warn(`Key resync: unknown group ${payload.groupId}`)
        return
      }
      if (!group.members.find(m => m.peerId === peerId)) {
        log.warn(`Key resync: peer ${peerId} is not a member of ${payload.groupId}`)
        return
      }
      const key = getCurrentGroupKey(payload.groupId)
      if (!key) {
        // V1.4.0 关键修复：owner 也没密钥时必须回 nack，否则请求方会傻等 10s
        log.warn(`[KeyResync] Owner side has no local key for group ${payload.groupId}, sending nack to ${peerId}`)
        const friend = udpBroadcaster.getFriend(peerId)
        if (friend) {
          const nack = {
            type: 'resp',
            requestId: payload.requestId,
            groupId: payload.groupId,
            error: 'no-local-key',
            timestamp: Date.now(),
          }
          try {
            const nackEncrypted = cryptoService.encryptForTransmission(peerId, JSON.stringify(nack))
            sendToPeer(friend, createPacket(GROUP_PACKET_KINDS.KEY_RESYNC, {
              fromPeerId: this.selfPeerId(),
              encrypted: nackEncrypted,
            })).catch((err) => {
              log.error('Failed to send key resync nack:', err)
            })
          } catch (err) {
            log.error('Failed to encrypt key resync nack:', err)
          }
        }
        return
      }

      const friend = udpBroadcaster.getFriend(peerId)
      if (!friend) return

      const response = {
        type: 'resp',
        requestId: payload.requestId,
        groupId: payload.groupId,
        keyVersion: group.keyVersion,
        groupKey: key.toString('base64'),
        timestamp: Date.now(),
      }
      const respEncrypted = cryptoService.encryptForTransmission(peerId, JSON.stringify(response))
      sendToPeer(friend, createPacket(GROUP_PACKET_KINDS.KEY_RESYNC, {
        fromPeerId: this.selfPeerId(),
        encrypted: respEncrypted,
      })).catch((err) => {
        log.error('Failed to send key resync response:', err)
      })
      log.info(`[KeyResync] Sent group key to ${peerId} for group ${payload.groupId} v${group.keyVersion}`)
    } catch (err) {
      log.error('handleKeyResync failed:', err)
    }
  }

  private handleKeyResyncResponse(payload: {
    requestId: string
    groupId: string
    keyVersion?: number
    groupKey?: string
    error?: string
  }, fromPeerId: string): void {
    const pending = this.pendingKeyResyncs.get(payload.requestId)
    if (!pending) {
      log.warn(`Key resync response: no pending request for ${payload.requestId}`)
      return
    }

    // nack 分支
    if (payload.error === 'no-local-key') {
      log.warn(`[KeyResync] Owner ${fromPeerId} nacked: also has no local key for group ${payload.groupId}`)
      clearTimeout(pending.timeout)
      this.pendingKeyResyncs.delete(payload.requestId)
      pending.resolve({ key: null, reason: 'owner-nack-no-key' })
      return
    }

    if (!payload.groupKey || payload.keyVersion === undefined) {
      log.warn('Key resync response: missing groupKey/keyVersion')
      return
    }
    const key = Buffer.from(payload.groupKey, 'base64')
    registerGroupKey(payload.groupId, payload.keyVersion, key)

    const group = storageService.getGroup(payload.groupId)
    if (group && payload.keyVersion > group.keyVersion) {
      group.keyVersion = payload.keyVersion
      storageService.saveGroup(group)
    }

    clearTimeout(pending.timeout)
    this.pendingKeyResyncs.delete(payload.requestId)
    pending.resolve({ key })
    log.info(`[KeyResync] Received group key for ${payload.groupId} v${payload.keyVersion} from ${fromPeerId}`)
  }

  // 加密 groupKey 给某个成员（用该成员的 ECDH 会话密钥二次加密）
  private encryptGroupKeyForPeer(peerId: string, groupId: string, keyVersion: number, groupKey: Buffer): EncryptedData {
    const payload = encryptGroupKeyPayload(groupKey, groupId, keyVersion)
    return cryptoService.encryptForTransmission(peerId, payload)
  }

  // 解密收到的 groupKey（用发送者的 ECDH 会话密钥解开）
  private decryptGroupKeyFromPeer(senderPeerId: string, encrypted: EncryptedData): { groupId: string; keyVersion: number; groupKey: Buffer } {
    const payload = cryptoService.decryptFromTransmission(senderPeerId, encrypted)
    return decryptGroupKeyPayload(payload)
  }

  private async ensureSessionKey(peerId: string): Promise<void> {
    if (!cryptoService.needsRenegotiation(peerId)) return
    const friend = udpBroadcaster.getFriend(peerId)
    if (!friend || !friend.online) throw new Error(`Peer ${peerId} is not online for key negotiation`)
    const requestJson = await cryptoService.negotiateKey(peerId)
    if (requestJson) {
      await sendToPeer(friend, createPacket('key-negotiation', JSON.parse(requestJson)))
      await cryptoService.waitForSessionKey(peerId)
    }
  }

  private buildMemberSnapshot(peerId: string, nickname: string, role: GroupRole, keyVersion: number, avatar?: string): GroupMemberSnapshot {
    return {
      peerId,
      nickname,
      role,
      joinedAt: Date.now(),
      keyVersion,
      avatar,
    }
  }

  // ============================================================
  // 创建群
  // ============================================================
  async createGroup(groupName: string, memberPeerIds: string[]): Promise<Group> {
    if (!groupName.trim()) throw new Error('Group name cannot be empty')
    const selfId = this.selfPeerId()
    if (memberPeerIds.length === 0) {
      throw new Error('At least one member is required (besides yourself)')
    }
    if (memberPeerIds.length + 1 > MAX_GROUP_MEMBERS) {
      throw new Error(`Group size exceeds limit of ${MAX_GROUP_MEMBERS}`)
    }
    for (const pid of memberPeerIds) {
      const friend = udpBroadcaster.getFriend(pid)
      if (!friend) throw new Error(`Peer ${pid} is not a known friend`)
    }

    const groupId = this.newGroupId()
    const groupKey = generateGroupKey()
    const keyVersion = 1
    const now = Date.now()

    const memberList: GroupMember[] = [
      {
        peerId: selfId,
        nickname: this.selfNickname(),
        avatar: this.selfAvatar(),
        role: GroupRole.OWNER,
        joinedAt: now,
        keyVersion,
      },
      ...memberPeerIds.map(pid => {
        const f = udpBroadcaster.getFriend(pid)!
        return {
          peerId: pid,
          nickname: f.nickname,
          avatar: f.avatar,
          role: GroupRole.MEMBER,
          joinedAt: now,
          keyVersion,
        }
      }),
    ]
    const group: Group = {
      groupId,
      groupName: groupName.trim(),
      ownerPeerId: selfId,
      members: memberList,
      createdAt: now,
      updatedAt: now,
      keyVersion,
    }
    storageService.saveGroup(group)
    registerGroupKey(groupId, keyVersion, groupKey)

    for (const pid of memberPeerIds) {
      const friend = udpBroadcaster.getFriend(pid)
      if (!friend) continue
      try {
        await this.ensureSessionKey(pid)
        const encryptedKey = this.encryptGroupKeyForPeer(pid, groupId, keyVersion, groupKey)
        const createData: GroupCreatePacket = {
          version: GROUP_PROTOCOL_VERSION,
          groupId,
          groupName: group.groupName,
          ownerPeerId: selfId,
          fromPeerId: selfId,
          timestamp: Date.now(),
          initialMembers: memberList.map(m => this.buildMemberSnapshot(m.peerId, m.nickname, m.role, m.keyVersion, m.avatar)),
          encryptedGroupKeys: { [pid]: encryptedKey },
          keyVersion,
          ownerNickname: this.selfNickname(),
          ownerAvatar: this.selfAvatar(),
        }
        await sendToPeer(friend, createPacket(GROUP_PACKET_KINDS.CREATE, createData))
      } catch (err) {
        log.warn(`Failed to send group-create to ${pid}, will retry later:`, err)
        markPendingKeyDelivery(groupId, pid)
      }
    }

    pushGroupCreated(group)
    log.info(`Group created: ${groupId} (${group.groupName}) with ${memberPeerIds.length} members`)
    return group
  }

  // ============================================================
  // 邀请新成员
  // ============================================================
  async inviteMembers(groupId: string, memberPeerIds: string[]): Promise<void> {
    const group = storageService.getGroup(groupId)
    if (!group) throw new Error('Group not found')
    const selfId = this.selfPeerId()
    if (group.ownerPeerId !== selfId) throw new Error('Only owner can invite members')

    if (group.members.length + memberPeerIds.length > MAX_GROUP_MEMBERS) {
      throw new Error(`Group size would exceed limit of ${MAX_GROUP_MEMBERS}`)
    }

    const newMembers: GroupMember[] = []
    for (const pid of memberPeerIds) {
      if (group.members.find(m => m.peerId === pid)) continue
      const friend = udpBroadcaster.getFriend(pid)
      if (!friend) throw new Error(`Peer ${pid} is not a known friend`)
      newMembers.push({
        peerId: pid,
        nickname: friend.nickname,
        avatar: friend.avatar,
        role: GroupRole.MEMBER,
        joinedAt: Date.now(),
        keyVersion: group.keyVersion,
      })
    }
    if (newMembers.length === 0) return

    // 轮换密钥防止被踢/离开的成员继续解密
    const newGroupKey = generateGroupKey()
    const newKeyVersion = group.keyVersion + 1
    group.members.push(...newMembers)
    for (const m of group.members) m.keyVersion = newKeyVersion
    group.keyVersion = newKeyVersion
    group.updatedAt = Date.now()
    storageService.saveGroup(group)
    registerGroupKey(groupId, newKeyVersion, newGroupKey)

    const newEncryptedGroupKeys: Record<string, EncryptedData> = {}
    for (const m of newMembers) {
      try {
        await this.ensureSessionKey(m.peerId)
        newEncryptedGroupKeys[m.peerId] = this.encryptGroupKeyForPeer(m.peerId, groupId, newKeyVersion, newGroupKey)
      } catch (err) {
        log.warn(`Failed to prepare key for ${m.peerId}:`, err)
      }
    }

    // 也为现有成员轮换密钥（除了新成员和新 key 的接收者）
    for (const m of group.members) {
      if (m.peerId === selfId) continue
      if (newMembers.find(n => n.peerId === m.peerId)) continue
      const friend = udpBroadcaster.getFriend(m.peerId)
      if (!friend) continue
      try {
        await this.ensureSessionKey(m.peerId)
        const encrypted = this.encryptGroupKeyForPeer(m.peerId, groupId, newKeyVersion, newGroupKey)
        const update: GroupUpdatePacket = {
          version: GROUP_PROTOCOL_VERSION,
          groupId,
          fromPeerId: selfId,
          updateType: 'key-rotate',
          timestamp: Date.now(),
          newKeyVersion,
          newEncryptedGroupKeys: { [m.peerId]: encrypted },
        }
        await sendToPeer(friend, createPacket(GROUP_PACKET_KINDS.UPDATE, update))
      } catch (err) {
        log.warn(`Failed to send key-rotate to ${m.peerId}:`, err)
      }
    }

    // 给新成员发 invite
    for (const m of newMembers) {
      const friend = udpBroadcaster.getFriend(m.peerId)
      if (!friend) continue
      try {
        const invite: GroupInvitePacket = {
          version: GROUP_PROTOCOL_VERSION,
          groupId,
          groupName: group.groupName,
          fromPeerId: selfId,
          inviterPeerId: selfId,
          inviteePeerId: m.peerId,
          timestamp: Date.now(),
          encryptedGroupKey: newEncryptedGroupKeys[m.peerId],
          keyVersion: newKeyVersion,
          inviterNickname: this.selfNickname(),
          initialMembers: group.members.map(mm => this.buildMemberSnapshot(mm.peerId, mm.nickname, mm.role, mm.keyVersion, mm.avatar)),
          ownerNickname: this.selfNickname(),
          ownerAvatar: this.selfAvatar(),
        }
        await sendToPeer(friend, createPacket(GROUP_PACKET_KINDS.INVITE, invite))
      } catch (err) {
        log.warn(`Failed to send group-invite to ${m.peerId}:`, err)
      }
    }

    pushGroupUpdated(group)
    pushGroupMemberChanged({ groupId, type: 'added', peerIds: newMembers.map(m => m.peerId) })
    log.info(`Invited ${newMembers.length} members to group ${groupId}`)
  }

  // ============================================================
  // 离开群
  // ============================================================
  async leaveGroup(groupId: string): Promise<void> {
    const group = storageService.getGroup(groupId)
    if (!group) throw new Error('Group not found')
    const selfId = this.selfPeerId()
    if (!group.members.find(m => m.peerId === selfId)) throw new Error('You are not a member of this group')

    // 通知其他成员
    const leave: GroupLeavePacket = {
      version: GROUP_PROTOCOL_VERSION,
      groupId,
      fromPeerId: selfId,
      leaverPeerId: selfId,
      timestamp: Date.now(),
    }
    for (const m of group.members) {
      if (m.peerId === selfId) continue
      const friend = udpBroadcaster.getFriend(m.peerId)
      if (!friend) continue
      try {
        await this.ensureSessionKey(m.peerId)
        const encrypted = cryptoService.encryptForTransmission(m.peerId, JSON.stringify(leave))
        sendToPeer(friend, createPacket(GROUP_PACKET_KINDS.LEAVE, {
          fromPeerId: selfId,
          encrypted,
        })).catch(() => {})
      } catch (err) {
        log.warn(`Failed to notify ${m.peerId} of leave:`, err)
      }
    }

    group.members = group.members.filter(m => m.peerId !== selfId)
    // 轮换密钥
    const newGroupKey = generateGroupKey()
    const newKeyVersion = group.keyVersion + 1
    group.keyVersion = newKeyVersion
    for (const m of group.members) m.keyVersion = newKeyVersion
    group.updatedAt = Date.now()
    storageService.saveGroup(group)
    registerGroupKey(groupId, newKeyVersion, newGroupKey)

    storageService.deleteGroup(groupId)
    dropGroupKeys(groupId)
    pushGroupUpdated({ ...group, members: group.members.filter(m => m.peerId !== selfId) })
    log.info(`Left group: ${groupId}`)
  }

  // ============================================================
  // 踢人
  // ============================================================
  async kickMember(groupId: string, peerId: string): Promise<void> {
    const group = storageService.getGroup(groupId)
    if (!group) throw new Error('Group not found')
    const selfId = this.selfPeerId()
    if (group.ownerPeerId !== selfId) throw new Error('Only owner can kick members')
    if (peerId === selfId) throw new Error('Cannot kick yourself')
    if (!group.members.find(m => m.peerId === peerId)) throw new Error('Peer is not a member')

    const kick: GroupKickPacket = {
      version: GROUP_PROTOCOL_VERSION,
      groupId,
      fromPeerId: selfId,
      kickedPeerId: peerId,
      timestamp: Date.now(),
    }
    const friend = udpBroadcaster.getFriend(peerId)
    if (friend) {
      try {
        await this.ensureSessionKey(peerId)
        const encrypted = cryptoService.encryptForTransmission(peerId, JSON.stringify(kick))
        sendToPeer(friend, createPacket(GROUP_PACKET_KINDS.KICK, {
          fromPeerId: selfId,
          encrypted,
        })).catch(() => {})
      } catch (err) {
        log.warn(`Failed to notify ${peerId} of kick:`, err)
      }
    }

    group.members = group.members.filter(m => m.peerId !== peerId)
    const newGroupKey = generateGroupKey()
    const newKeyVersion = group.keyVersion + 1
    group.keyVersion = newKeyVersion
    for (const m of group.members) m.keyVersion = newKeyVersion
    group.updatedAt = Date.now()
    storageService.saveGroup(group)
    registerGroupKey(groupId, newKeyVersion, newGroupKey)

    pushGroupMemberChanged({ groupId, type: 'removed', peerIds: [peerId] })
    pushGroupUpdated(group)
    log.info(`Kicked ${peerId} from group ${groupId}`)
  }

  // ============================================================
  // 解散群
  // ============================================================
  async dismissGroup(groupId: string): Promise<void> {
    const group = storageService.getGroup(groupId)
    if (!group) throw new Error('Group not found')
    const selfId = this.selfPeerId()
    if (group.ownerPeerId !== selfId) throw new Error('Only owner can dismiss the group')

    const dismiss: GroupDismissPacket = {
      version: GROUP_PROTOCOL_VERSION,
      groupId,
      fromPeerId: selfId,
      timestamp: Date.now(),
    }
    for (const m of group.members) {
      if (m.peerId === selfId) continue
      const friend = udpBroadcaster.getFriend(m.peerId)
      if (!friend) continue
      try {
        await this.ensureSessionKey(m.peerId)
        const encrypted = cryptoService.encryptForTransmission(m.peerId, JSON.stringify(dismiss))
        sendToPeer(friend, createPacket(GROUP_PACKET_KINDS.DISMISS, {
          fromPeerId: selfId,
          encrypted,
        })).catch(() => {})
      } catch (err) {
        log.warn(`Failed to notify ${m.peerId} of dismiss:`, err)
      }
    }

    storageService.deleteGroup(groupId)
    dropGroupKeys(groupId)
    pushGroupDissolved({ groupId, reason: 'owner-dismissed' })
    log.info(`Group dismissed: ${groupId}`)
  }

  // ============================================================
  // 更新群名
  // ============================================================
  async updateGroupName(groupId: string, newName: string): Promise<void> {
    const group = storageService.getGroup(groupId)
    if (!group) throw new Error('Group not found')
    const selfId = this.selfPeerId()
    if (group.ownerPeerId !== selfId) throw new Error('Only owner can rename the group')
    if (!newName.trim()) throw new Error('Group name cannot be empty')

    const trimmed = newName.trim()
    if (trimmed === group.groupName) return

    // 轮换密钥
    const newGroupKey = generateGroupKey()
    const newKeyVersion = group.keyVersion + 1
    group.groupName = trimmed
    group.keyVersion = newKeyVersion
    for (const m of group.members) m.keyVersion = newKeyVersion
    group.updatedAt = Date.now()
    storageService.saveGroup(group)
    registerGroupKey(groupId, newKeyVersion, newGroupKey)

    const newEncryptedGroupKeys: Record<string, EncryptedData> = {}
    for (const m of group.members) {
      if (m.peerId === selfId) continue
      const friend = udpBroadcaster.getFriend(m.peerId)
      if (!friend) continue
      try {
        await this.ensureSessionKey(m.peerId)
        newEncryptedGroupKeys[m.peerId] = this.encryptGroupKeyForPeer(m.peerId, groupId, newKeyVersion, newGroupKey)
        const update: GroupUpdatePacket = {
          version: GROUP_PROTOCOL_VERSION,
          groupId,
          fromPeerId: selfId,
          updateType: 'name',
          newName: trimmed,
          timestamp: Date.now(),
          newKeyVersion,
          newEncryptedGroupKeys: { [m.peerId]: newEncryptedGroupKeys[m.peerId] },
        }
        await sendToPeer(friend, createPacket(GROUP_PACKET_KINDS.UPDATE, update))
      } catch (err) {
        log.warn(`Failed to send rename to ${m.peerId}:`, err)
      }
    }
    pushGroupUpdated(group)
    log.info(`Group renamed: ${groupId} -> ${trimmed}`)
  }

  // ============================================================
  // 发送文本
  // ============================================================
  async sendText(groupId: string, content: string, mentions?: string[], mentionedAll?: boolean): Promise<string> {
    if (!content.trim()) throw new Error('Message content cannot be empty')
    const group = storageService.getGroup(groupId)
    if (!group) throw new Error('Group not found')

    const selfId = this.selfPeerId()
    const messageId = crypto.randomUUID()
    const timestamp = Date.now()
    const groupKey = await this.ensureGroupKey(groupId)

    const businessPacket: GroupMessagePacket = {
      version: GROUP_PROTOCOL_VERSION,
      type: MessageType.TEXT,
      messageId,
      groupId,
      fromPeerId: selfId,
      senderNickname: this.selfNickname(),
      timestamp,
      payload: content,
      mentions,
      mentionedAll,
    }
    const innerEncrypted = encryptWithGroupKey(groupKey, JSON.stringify(businessPacket), groupId)

    const record: ChatRecord = {
      id: messageId,
      type: MessageType.TEXT,
      direction: 'sent',
      content: JSON.stringify(cryptoService.encryptForStorage(content)),
      status: MessageStatus.SENDING,
      timestamp,
      conversationType: ConversationType.GROUP,
      groupId,
      senderPeerId: selfId,
      mentions,
      mentionedAll,
    }
    storageService.saveChatRecord(record)

    const onlineMembers = this.onlineMembers(group).filter(m => m.peerId !== selfId)
    const memberPeerIds = group.members.filter(m => m.peerId !== selfId).map(m => m.peerId)
    let successCount = 0

    for (const pid of memberPeerIds) {
      const friend = udpBroadcaster.getFriend(pid)
      if (!friend) continue
      try {
        await this.ensureSessionKey(pid)
        const outerEncrypted = cryptoService.encryptForTransmission(pid, JSON.stringify(innerEncrypted))
        const packet = createPacket(GROUP_PACKET_KINDS.MESSAGE, {
          groupId,
          fromPeerId: selfId,
          encrypted: outerEncrypted,
        })
        await sendToPeer(friend, packet)
        successCount++
      } catch (err) {
        log.warn(`Failed to send group message to ${pid}:`, err)
      }
    }

    if (successCount > 0 || onlineMembers.length === 0) {
      record.status = MessageStatus.SENT
    } else {
      record.status = MessageStatus.FAILED
    }
    storageService.saveChatRecord(record)
    pushGroupMessageStatusUpdated({ groupId, messageId, status: record.status })

    return messageId
  }

  // ============================================================
  // 发送图片
  // ============================================================
  async sendImage(groupId: string, filePath: string): Promise<string> {
    const group = storageService.getGroup(groupId)
    if (!group) throw new Error('Group not found')

    const imageBuffer = fs.readFileSync(filePath)
    const base64 = imageBuffer.toString('base64')
    const selfId = this.selfPeerId()
    const messageId = crypto.randomUUID()
    const timestamp = Date.now()
    const groupKey = await this.ensureGroupKey(groupId)

    const businessPacket: GroupMessagePacket = {
      version: GROUP_PROTOCOL_VERSION,
      type: MessageType.IMAGE,
      messageId,
      groupId,
      fromPeerId: selfId,
      senderNickname: this.selfNickname(),
      timestamp,
      payload: base64,
    }
    const innerEncrypted = encryptWithGroupKey(groupKey, JSON.stringify(businessPacket), groupId)

    const record: ChatRecord = {
      id: messageId,
      type: MessageType.IMAGE,
      direction: 'sent',
      content: JSON.stringify(cryptoService.encryptForStorage(base64)),
      status: MessageStatus.SENDING,
      timestamp,
      conversationType: ConversationType.GROUP,
      groupId,
      senderPeerId: selfId,
    }
    storageService.saveChatRecord(record)

    let successCount = 0
    for (const pid of group.members.filter(m => m.peerId !== selfId).map(m => m.peerId)) {
      const friend = udpBroadcaster.getFriend(pid)
      if (!friend) continue
      try {
        await this.ensureSessionKey(pid)
        const outerEncrypted = cryptoService.encryptForTransmission(pid, JSON.stringify(innerEncrypted))
        const packet = createPacket(GROUP_PACKET_KINDS.MESSAGE, {
          groupId,
          fromPeerId: selfId,
          encrypted: outerEncrypted,
        })
        await sendToPeer(friend, packet)
        successCount++
      } catch (err) {
        log.warn(`Failed to send group image to ${pid}:`, err)
      }
    }

    record.status = successCount > 0 ? MessageStatus.SENT : MessageStatus.FAILED
    storageService.saveChatRecord(record)
    pushGroupMessageStatusUpdated({ groupId, messageId, status: record.status })
    return messageId
  }

  // ============================================================
  // V1.4.0: 群文件共享（广播元数据 + 发送方本地暂存）
  // ============================================================
  async sendFile(groupId: string, filePath: string): Promise<string> {
    const group = storageService.getGroup(groupId)
    if (!group) throw new Error('Group not found')

    const stat = fs.statSync(filePath)
    const fileName = path.basename(filePath)
    const messageId = crypto.randomUUID()
    const timestamp = Date.now()
    const selfId = this.selfPeerId()

    // 1. 复制文件到 FILES_DIR
    const dataDir = getDataDir()
    const filesDir = path.join(dataDir, FILES_DIR)
    if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true })
    const storedFileName = `${messageId}_${fileName}`
    const storedFilePath = path.join(filesDir, storedFileName)
    fs.copyFileSync(filePath, storedFilePath)

    // 2. md5
    const md5 = await this.calculateFileMD5(filePath)

    // 3. 加密 + 落库
    const groupKey = await this.ensureGroupKey(groupId)

    const businessPacket: GroupMessagePacket = {
      version: GROUP_PROTOCOL_VERSION,
      type: MessageType.FILE,
      messageId,
      groupId,
      fromPeerId: selfId,
      senderNickname: this.selfNickname(),
      timestamp,
      payload: JSON.stringify({ storedFileName, md5 }),
      fileName,
      fileSize: stat.size,
    }
    const innerEncrypted = encryptWithGroupKey(groupKey, JSON.stringify(businessPacket), groupId)

    const record: ChatRecord = {
      id: messageId,
      type: MessageType.FILE,
      direction: 'sent',
      content: '',
      fileName,
      fileSize: stat.size,
      status: MessageStatus.SENDING,
      timestamp,
      conversationType: ConversationType.GROUP,
      groupId,
      senderPeerId: selfId,
    }
    storageService.saveChatRecord(record)

    let successCount = 0
    for (const m of group.members) {
      if (m.peerId === selfId) continue
      const friend = udpBroadcaster.getFriend(m.peerId)
      if (!friend) continue
      try {
        await this.ensureSessionKey(m.peerId)
        const outerEncrypted = cryptoService.encryptForTransmission(m.peerId, JSON.stringify(innerEncrypted))
        const packet = createPacket(GROUP_PACKET_KINDS.MESSAGE, {
          groupId,
          fromPeerId: selfId,
          encrypted: outerEncrypted,
        })
        await sendToPeer(friend, packet)
        successCount++
      } catch (err) {
        log.warn(`Failed to send group file to ${m.peerId}:`, err)
      }
    }

    record.status = successCount > 0 ? MessageStatus.SENT : MessageStatus.FAILED
    storageService.saveChatRecord(record)
    pushGroupMessageStatusUpdated({ groupId, messageId, status: record.status })

    log.info(`Group file shared: ${groupId} ${fileName} (${stat.size}B) with ${successCount}/${group.members.length - 1} members`)
    return messageId
  }

  private calculateFileMD5(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5')
      const stream = fs.createReadStream(filePath)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  // ============================================================
  // 历史记录
  // ============================================================
  async loadHistory(groupId: string, limit = 100, offset = 0): Promise<ChatRecord[]> {
    const records = storageService.queryGroupChatRecords(groupId, limit, offset)
    return records.map(r => ({
      ...r,
      content: this.decryptStoredContent(r.content),
    }))
  }

  private decryptStoredContent(stored: string): string {
    try {
      const encrypted = JSON.parse(stored)
      return cryptoService.decryptFromStorage(encrypted)
    } catch {
      return stored
    }
  }

  // ============================================================
  // 群组查询
  // ============================================================
  getGroups(): Group[] {
    return storageService.queryGroups()
  }

  getGroup(groupId: string): Group | undefined {
    return storageService.getGroup(groupId)
  }

  // ============================================================
  // 邀请回复
  // ============================================================
  getPendingInvites(): GroupInvitePacket[] {
    return Array.from(this.pendingInvites.values())
  }

  takePendingInvite(inviterPeerId: string, groupId: string): GroupInvitePacket | undefined {
    const key = `${inviterPeerId}:${groupId}`
    const inv = this.pendingInvites.get(key)
    if (inv) {
      this.pendingInvites.delete(key)
      return inv
    }
    return undefined
  }

  acceptInviteCreateLocalGroup(invite: GroupInvitePacket, inviterPeerId: string): Group | null {
    try {
      const { groupId, keyVersion, groupKey } = this.decryptGroupKeyFromPeer(inviterPeerId, invite.encryptedGroupKey)
      if (groupId !== invite.groupId || keyVersion !== invite.keyVersion) {
        log.warn('acceptInviteCreateLocalGroup: key metadata mismatch')
        return null
      }
      registerGroupKey(groupId, keyVersion, groupKey)

      const selfId = this.selfPeerId()
      const inviterMember: GroupMember = {
        peerId: inviterPeerId,
        nickname: invite.inviterNickname || 'Unknown',
        role: GroupRole.OWNER,
        joinedAt: invite.timestamp,
        keyVersion,
      }
      const selfMember: GroupMember = {
        peerId: selfId,
        nickname: this.selfNickname(),
        avatar: this.selfAvatar(),
        role: GroupRole.MEMBER,
        joinedAt: Date.now(),
        keyVersion,
      }
      const others: GroupMember[] = (invite.initialMembers || [])
        .filter(m => m.peerId !== selfId && m.peerId !== inviterPeerId)
        .map(m => ({
          peerId: m.peerId,
          nickname: m.nickname,
          avatar: m.avatar,
          role: m.role || GroupRole.MEMBER,
          joinedAt: m.joinedAt,
          keyVersion: m.keyVersion,
        }))

      const group: Group = {
        groupId,
        groupName: invite.groupName,
        ownerPeerId: inviterPeerId,
        members: [inviterMember, selfMember, ...others],
        createdAt: invite.timestamp,
        updatedAt: Date.now(),
        keyVersion,
      }
      storageService.saveGroup(group)
      pushGroupCreated(group)
      log.info(`Accepted invite, joined group ${groupId}`)
      return group
    } catch (err) {
      log.error('acceptInviteCreateLocalGroup failed:', err)
      return null
    }
  }

  async respondInvite(inviterPeerId: string, groupId: string, accept: boolean): Promise<void> {
    const invite = this.takePendingInvite(inviterPeerId, groupId)
    if (!invite) {
      log.warn(`respondInvite: no pending invite for ${inviterPeerId}:${groupId}`)
      return
    }

    const friend = udpBroadcaster.getFriend(inviterPeerId)
    if (!friend) throw new Error('Inviter is not online')

    if (accept) {
      // 已经通过 acceptInviteCreateLocalGroup 建立本地群
      const ack: GroupJoinAcceptPacket = {
        version: GROUP_PROTOCOL_VERSION,
        groupId,
        fromPeerId: inviterPeerId,
        joinerPeerId: this.selfPeerId(),
        joinerNickname: this.selfNickname(),
        timestamp: Date.now(),
      }
      try {
        await this.ensureSessionKey(inviterPeerId)
        const encrypted = cryptoService.encryptForTransmission(inviterPeerId, JSON.stringify(ack))
        sendToPeer(friend, createPacket(GROUP_PACKET_KINDS.JOIN_ACCEPT, {
          fromPeerId: this.selfPeerId(),
          encrypted,
        })).catch(() => {})
      } catch (err) {
        log.warn(`Failed to send join-accept:`, err)
      }
    } else {
      const reject: GroupInviteRejectPacket = {
        version: GROUP_PROTOCOL_VERSION,
        groupId,
        fromPeerId: inviterPeerId,
        inviteePeerId: this.selfPeerId(),
        timestamp: Date.now(),
      }
      try {
        await this.ensureSessionKey(inviterPeerId)
        const encrypted = cryptoService.encryptForTransmission(inviterPeerId, JSON.stringify(reject))
        sendToPeer(friend, createPacket(GROUP_PACKET_KINDS.INVITE_REJECT, {
          fromPeerId: this.selfPeerId(),
          encrypted,
        })).catch(() => {})
      } catch (err) {
        log.warn(`Failed to send invite-reject:`, err)
      }
    }
  }

  private pendingInvites = new Map<string, GroupInvitePacket>()

  // ============================================================
  // 处理收到的群相关包
  // ============================================================
  handleGroupCreate(data: any, fromPeerId: string): void {
    try {
      const packet = data as GroupCreatePacket
      if (packet.version !== GROUP_PROTOCOL_VERSION) {
        log.warn(`Group create: unsupported version ${packet.version}`)
        return
      }
      const selfId = this.selfPeerId()
      const myEncrypted = packet.encryptedGroupKeys[selfId]
      if (!myEncrypted) {
        log.warn(`Group create: no encrypted key for self`)
        return
      }
      const { groupId, keyVersion, groupKey } = this.decryptGroupKeyFromPeer(fromPeerId, myEncrypted)
      if (groupId !== packet.groupId || keyVersion !== packet.keyVersion) {
        log.warn(`Group create: key metadata mismatch`)
        return
      }
      registerGroupKey(groupId, keyVersion, groupKey)

      const selfMember: GroupMember = {
        peerId: selfId,
        nickname: this.selfNickname(),
        avatar: this.selfAvatar(),
        role: GroupRole.MEMBER,
        joinedAt: Date.now(),
        keyVersion,
      }
      const ownerSnapshot = packet.initialMembers.find(m => m.peerId === packet.ownerPeerId)
      const ownerMember: GroupMember = {
        peerId: packet.ownerPeerId,
        nickname: ownerSnapshot?.nickname || packet.ownerNickname || 'Unknown',
        avatar: ownerSnapshot?.avatar || packet.ownerAvatar,
        role: GroupRole.OWNER,
        joinedAt: packet.timestamp,
        keyVersion,
      }
      const otherMembers: GroupMember[] = packet.initialMembers
        .filter(m => m.peerId !== selfId && m.peerId !== packet.ownerPeerId)
        .map(m => ({
          peerId: m.peerId,
          nickname: m.nickname,
          avatar: m.avatar,
          role: m.role || GroupRole.MEMBER,
          joinedAt: m.joinedAt,
          keyVersion: m.keyVersion,
        }))

      const group: Group = {
        groupId,
        groupName: packet.groupName,
        ownerPeerId: packet.ownerPeerId,
        members: [ownerMember, selfMember, ...otherMembers],
        createdAt: packet.timestamp,
        updatedAt: Date.now(),
        keyVersion,
      }
      storageService.saveGroup(group)
      clearPendingKeyDelivery(groupId, selfId)
      pushGroupCreated(group)
      log.info(`Joined new group: ${groupId} (${group.groupName})`)
    } catch (err) {
      log.error('Failed to handle group-create:', err)
    }
  }

  handleGroupInvite(data: any, fromPeerId: string): void {
    try {
      const packet = data as GroupInvitePacket
      if (packet.version !== GROUP_PROTOCOL_VERSION) {
        log.warn(`Group invite: unsupported version ${packet.version}`)
        return
      }
      if (storageService.getGroup(packet.groupId)) {
        log.info(`Group invite ignored: already in group ${packet.groupId}`)
        return
      }
      const selfId = this.selfPeerId()
      if (packet.inviteePeerId !== selfId) {
        log.warn(`Group invite: not addressed to me (${selfId})`)
        return
      }
      const { groupId, keyVersion, groupKey } = this.decryptGroupKeyFromPeer(fromPeerId, packet.encryptedGroupKey)
      if (groupId !== packet.groupId || keyVersion !== packet.keyVersion) {
        log.warn(`Group invite: key metadata mismatch`)
        return
      }
      registerGroupKey(groupId, keyVersion, groupKey)
      this.pendingInvites.set(`${fromPeerId}:${groupId}`, packet)
      pushGroupInviteReceived({
        inviterPeerId: fromPeerId,
        groupId,
        groupName: packet.groupName,
        inviterNickname: packet.inviterNickname,
        keyVersion: keyVersion,
        timestamp: Date.now(),
      })
      log.info(`Pending invite: ${groupId} from ${fromPeerId}`)
    } catch (err) {
      log.error('Failed to handle group-invite:', err)
    }
  }

  handleGroupJoinAccept(data: any, fromPeerId: string): void {
    try {
      const peerId = (data?.fromPeerId as string) || fromPeerId
      const encrypted = data?.encrypted
      if (!encrypted) return
      const decrypted = cryptoService.decryptFromTransmission(peerId, encrypted)
      const packet = JSON.parse(decrypted) as GroupJoinAcceptPacket
      const group = storageService.getGroup(packet.groupId)
      if (!group) return
      if (!group.members.find(m => m.peerId === packet.joinerPeerId)) {
        group.members.push({
          peerId: packet.joinerPeerId,
          nickname: 'Member',
          role: GroupRole.MEMBER,
          joinedAt: Date.now(),
          keyVersion: group.keyVersion,
        })
        storageService.saveGroup(group)
        pushGroupMemberChanged({ groupId: packet.groupId, type: 'added', peerIds: [packet.joinerPeerId] })
        pushGroupUpdated(group)
      }
    } catch (err) {
      log.warn('Failed to handle group-join-accept:', err)
    }
  }

  handleGroupInviteReject(data: any, fromPeerId: string): void {
    try {
      const peerId = (data?.fromPeerId as string) || fromPeerId
      const encrypted = data?.encrypted
      if (!encrypted) return
      const decrypted = cryptoService.decryptFromTransmission(peerId, encrypted)
      const packet = JSON.parse(decrypted) as GroupInviteRejectPacket
      pushGroupInviteResponded({
        groupId: packet.groupId,
        peerId: peerId,
        nickname: '',
        accepted: false,
        timestamp: Date.now(),
      })
    } catch (err) {
      log.error('Failed to handle group-invite-reject:', err)
    }
  }

  handleGroupLeave(data: any, fromPeerId: string): void {
    try {
      const peerId = (data?.fromPeerId as string) || fromPeerId
      const encrypted = data?.encrypted
      if (!encrypted) return
      const decrypted = cryptoService.decryptFromTransmission(peerId, encrypted)
      const packet = JSON.parse(decrypted) as GroupLeavePacket
      const group = storageService.getGroup(packet.groupId)
      if (!group) return
      group.members = group.members.filter(m => m.peerId !== packet.leaverPeerId)
      const newGroupKey = generateGroupKey()
      const newKeyVersion = group.keyVersion + 1
      group.keyVersion = newKeyVersion
      for (const m of group.members) m.keyVersion = newKeyVersion
      group.updatedAt = Date.now()
      storageService.saveGroup(group)
      registerGroupKey(packet.groupId, newKeyVersion, newGroupKey)
      pushGroupMemberChanged({ groupId: packet.groupId, type: 'left', peerIds: [packet.leaverPeerId] })
      pushGroupUpdated(group)
    } catch (err) {
      log.error('Failed to handle group-leave:', err)
    }
  }

  handleGroupKick(data: any, fromPeerId: string): void {
    try {
      const peerId = (data?.fromPeerId as string) || fromPeerId
      const encrypted = data?.encrypted
      if (!encrypted) return
      const decrypted = cryptoService.decryptFromTransmission(peerId, encrypted)
      const packet = JSON.parse(decrypted) as GroupKickPacket
      const group = storageService.getGroup(packet.groupId)
      if (!group) return
      const selfId = this.selfPeerId()
      if (packet.kickedPeerId === selfId) {
        storageService.deleteGroup(packet.groupId)
        dropGroupKeys(packet.groupId)
        pushGroupDissolved({ groupId: packet.groupId, reason: 'kicked' })
        log.info(`Kicked from group: ${packet.groupId}`)
      } else {
        group.members = group.members.filter(m => m.peerId !== packet.kickedPeerId)
        const newGroupKey = generateGroupKey()
        const newKeyVersion = group.keyVersion + 1
        group.keyVersion = newKeyVersion
        for (const m of group.members) m.keyVersion = newKeyVersion
        group.updatedAt = Date.now()
        storageService.saveGroup(group)
        registerGroupKey(packet.groupId, newKeyVersion, newGroupKey)
        pushGroupMemberChanged({ groupId: packet.groupId, type: 'removed', peerIds: [packet.kickedPeerId] })
        pushGroupUpdated(group)
      }
    } catch (err) {
      log.error('Failed to handle group-kick:', err)
    }
  }

  handleGroupDismiss(data: any, fromPeerId: string): void {
    try {
      const peerId = (data?.fromPeerId as string) || fromPeerId
      const encrypted = data?.encrypted
      if (!encrypted) return
      const decrypted = cryptoService.decryptFromTransmission(peerId, encrypted)
      const packet = JSON.parse(decrypted) as GroupDismissPacket
      const group = storageService.getGroup(packet.groupId)
      if (!group) return
      storageService.deleteGroup(packet.groupId)
      dropGroupKeys(packet.groupId)
      pushGroupDissolved({ groupId: packet.groupId })
      log.info(`Group dismissed: ${packet.groupId}`)
    } catch (err) {
      log.error('Failed to handle group-dismiss:', err)
    }
  }

  handleGroupUpdate(data: any, fromPeerId: string): void {
    try {
      const peerId = (data?.fromPeerId as string) || fromPeerId
      const encrypted = data?.encrypted
      if (!encrypted) return
      const decrypted = cryptoService.decryptFromTransmission(peerId, encrypted)
      const packet = JSON.parse(decrypted) as GroupUpdatePacket
      const group = storageService.getGroup(packet.groupId)
      if (!group) {
        log.warn(`Group update: unknown group ${packet.groupId}`)
        return
      }
      const selfId = this.selfPeerId()
      const myEncrypted = packet.newEncryptedGroupKeys?.[selfId]

      switch (packet.updateType) {
        case 'name': {
          if (packet.newName) {
            group.groupName = packet.newName
            group.updatedAt = Date.now()
          }
          if (myEncrypted && packet.newKeyVersion) {
            const { groupId, keyVersion, groupKey } = this.decryptGroupKeyFromPeer(peerId, myEncrypted)
            if (groupId === packet.groupId && keyVersion === packet.newKeyVersion) {
              registerGroupKey(groupId, keyVersion, groupKey)
              group.keyVersion = keyVersion
              for (const m of group.members) m.keyVersion = keyVersion
            }
          }
          storageService.saveGroup(group)
          pushGroupUpdated(group)
          break
        }
        case 'add-members': {
          if (myEncrypted && packet.newKeyVersion) {
            const { groupId, keyVersion, groupKey } = this.decryptGroupKeyFromPeer(peerId, myEncrypted)
            if (groupId === packet.groupId && keyVersion === packet.newKeyVersion) {
              registerGroupKey(groupId, keyVersion, groupKey)
              group.keyVersion = keyVersion
              for (const m of group.members) m.keyVersion = keyVersion
            }
          }
          if (packet.newMembers) {
            for (const nm of packet.newMembers) {
              if (!group.members.find(m => m.peerId === nm.peerId)) {
                group.members.push({
                  peerId: nm.peerId,
                  nickname: nm.nickname,
                  avatar: nm.avatar,
                  role: nm.role || GroupRole.MEMBER,
                  joinedAt: nm.joinedAt,
                  keyVersion: packet.newKeyVersion || group.keyVersion,
                })
              }
            }
          }
          group.updatedAt = Date.now()
          storageService.saveGroup(group)
          pushGroupMemberChanged({ groupId: packet.groupId, type: 'added', peerIds: packet.newMembers?.map(m => m.peerId) || [] })
          pushGroupUpdated(group)
          break
        }
        case 'key-rotate': {
          if (myEncrypted && packet.newKeyVersion) {
            const { groupId, keyVersion, groupKey } = this.decryptGroupKeyFromPeer(peerId, myEncrypted)
            if (groupId === packet.groupId && keyVersion === packet.newKeyVersion) {
              registerGroupKey(groupId, keyVersion, groupKey)
              group.keyVersion = keyVersion
              for (const m of group.members) m.keyVersion = keyVersion
            }
          }
          group.updatedAt = Date.now()
          storageService.saveGroup(group)
          pushGroupUpdated(group)
          break
        }
      }
    } catch (err) {
      log.error('Failed to handle group-update:', err)
    }
  }

  handleGroupMessage(data: any, fromPeerId: string): ChatRecord | null {
    try {
      const peerId = (data?.fromPeerId as string) || fromPeerId
      const encrypted = data?.encrypted
      if (!encrypted) return null
      const groupId = data.groupId
      if (!groupId) return null
      const group = storageService.getGroup(groupId)
      if (!group) {
        log.warn(`Group message: unknown group ${groupId}`)
        return null
      }
      if (!group.members.find(m => m.peerId === fromPeerId)) {
        log.warn(`Group message: sender ${fromPeerId} is not a member of ${groupId}`)
        return null
      }
      const outerDecrypted = cryptoService.decryptFromTransmission(fromPeerId, encrypted)
      const innerEncrypted = JSON.parse(outerDecrypted) as EncryptedData
      const groupKey = getGroupKey(groupId, group.keyVersion)
      if (!groupKey) {
        log.warn(`Group message: no group key for ${groupId} v${group.keyVersion}`)
        return null
      }
      const innerDecrypted = decryptWithGroupKey(groupKey, innerEncrypted, groupId)
      const businessPacket = JSON.parse(innerDecrypted) as GroupMessagePacket

      const record: ChatRecord = {
        id: businessPacket.messageId,
        type: businessPacket.type,
        direction: 'received',
        content: JSON.stringify(cryptoService.encryptForStorage(businessPacket.payload)),
        thumbnail: businessPacket.thumbnail,
        fileName: businessPacket.fileName,
        fileSize: businessPacket.fileSize,
        status: MessageStatus.DELIVERED,
        timestamp: businessPacket.timestamp,
        conversationType: ConversationType.GROUP,
        groupId,
        senderPeerId: fromPeerId,
        mentions: businessPacket.mentions,
        mentionedAll: businessPacket.mentionedAll,
      }
      storageService.saveChatRecord(record)

      const friend = udpBroadcaster.getFriend(fromPeerId)
      if (friend) {
        const ack: GroupMessageAckPacket = {
          version: GROUP_PROTOCOL_VERSION,
          groupId,
          messageId: businessPacket.messageId,
          fromPeerId: this.selfPeerId(),
          ackerPeerId: this.selfPeerId(),
          timestamp: Date.now(),
        }
        const ackEncrypted = cryptoService.encryptForTransmission(fromPeerId, JSON.stringify(ack))
        sendToPeer(friend, createPacket(GROUP_PACKET_KINDS.ACK, {
          groupId,
          fromPeerId: this.selfPeerId(),
          encrypted: ackEncrypted,
        })).catch(() => {})
      }

      return {
        ...record,
        content: businessPacket.payload,
        senderNickname: businessPacket.senderNickname,
      } as any
    } catch (err) {
      log.error('Failed to handle group-message:', err)
      return null
    }
  }

  handleGroupAck(data: any, fromPeerId: string): void {
    try {
      const peerId = (data?.fromPeerId as string) || fromPeerId
      const encrypted = data?.encrypted
      if (!encrypted) return
      const decrypted = cryptoService.decryptFromTransmission(peerId, encrypted)
      const ack = JSON.parse(decrypted) as GroupMessageAckPacket
      const records = storageService.queryGroupChatRecords(ack.groupId, 1000, 0)
      const record = records.find(r => r.id === ack.messageId && r.direction === 'sent')
      if (record && record.status !== MessageStatus.DELIVERED && record.status !== MessageStatus.READ) {
        record.status = MessageStatus.DELIVERED
        storageService.saveChatRecord(record)
        pushGroupMessageStatusUpdated({ groupId: ack.groupId, messageId: ack.messageId, status: MessageStatus.DELIVERED })
      }
    } catch (err) {
      log.warn('Failed to handle group-ack:', err)
    }
  }

  handleGroupRead(_data: any, _fromPeerId: string): void {
    // V1.4.0: 仅记录，不更新群已读状态
  }

  handleGroupRecall(data: any, fromPeerId: string): void {
    try {
      const peerId = (data?.fromPeerId as string) || fromPeerId
      const encrypted = data?.encrypted
      if (!encrypted) return
      const decrypted = cryptoService.decryptFromTransmission(peerId, encrypted)
      const packet = JSON.parse(decrypted) as GroupRecallPacket
      const records = storageService.queryGroupChatRecords(packet.groupId, 1000, 0)
      const record = records.find(r => r.id === packet.messageId)
      if (record) {
        record.recalled = true
        storageService.saveChatRecord(record)
      }
    } catch (err) {
      log.warn('Failed to handle group-recall:', err)
    }
  }

  // ============================================================
  // 上线重试：把 pending 的密钥投递给已上线的 peer
  // ============================================================
  async retryPendingDeliveriesForPeer(peerId: string): Promise<void> {
    const selfId = this.selfPeerId()
    const groups = storageService.queryGroups()
    for (const group of groups) {
      const pending = getPendingKeyDeliveries(group.groupId)
      if (!pending.includes(peerId)) continue
      // 只有 owner 才有 pending 投递
      if (group.ownerPeerId !== selfId) continue
      const friend = udpBroadcaster.getFriend(peerId)
      if (!friend) continue
      try {
        await this.ensureSessionKey(peerId)
        const groupKey = getCurrentGroupKey(group.groupId)
        if (!groupKey) continue
        const encryptedKey = this.encryptGroupKeyForPeer(peerId, group.groupId, group.keyVersion, groupKey)
        if (!group.members.find(m => m.peerId === peerId)) {
          const invitePacket: GroupInvitePacket = {
            version: GROUP_PROTOCOL_VERSION,
            groupId: group.groupId,
            groupName: group.groupName,
            fromPeerId: selfId,
            inviterPeerId: selfId,
            inviteePeerId: peerId,
            timestamp: Date.now(),
            encryptedGroupKey: encryptedKey,
            keyVersion: group.keyVersion,
            inviterNickname: this.selfNickname(),
            initialMembers: group.members.map(m => this.buildMemberSnapshot(m.peerId, m.nickname, m.role, m.keyVersion, m.avatar)),
            ownerNickname: this.selfNickname(),
            ownerAvatar: this.selfAvatar(),
          }
          await sendToPeer(friend, createPacket(GROUP_PACKET_KINDS.INVITE, invitePacket))
        } else {
          const updatePacket: GroupUpdatePacket = {
            version: GROUP_PROTOCOL_VERSION,
            groupId: group.groupId,
            fromPeerId: selfId,
            updateType: 'key-rotate',
            timestamp: Date.now(),
            newKeyVersion: group.keyVersion,
            newEncryptedGroupKeys: { [peerId]: encryptedKey },
          }
          await sendToPeer(friend, createPacket(GROUP_PACKET_KINDS.UPDATE, updatePacket))
        }
        clearPendingKeyDelivery(group.groupId, peerId)
        log.info(`Retried pending key delivery for ${peerId} in group ${group.groupId}`)
      } catch (err) {
        log.warn(`Retry pending delivery for ${peerId} in ${group.groupId} failed:`, err)
      }
    }
  }
}

// V1.4.0: 处理 file 中误用变量名的工具方法
function groupId_to_groupId(s: string): string { return s }

export const groupService = new GroupService()
