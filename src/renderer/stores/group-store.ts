import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Group, ChatRecord } from '@shared/types'

export interface PendingInvite {
  groupId: string
  groupName: string
  inviterPeerId: string
  inviterNickname: string
  keyVersion: number
  timestamp: number
}

export const useGroupStore = defineStore('group', () => {
  const groups = ref<Group[]>([])
  const selectedGroupId = ref<string>('')
  const messages = ref<ChatRecord[]>([])
  const unreadCounts = ref<Record<string, number>>({})
  const pendingInvites = ref<PendingInvite[]>([])

  const currentGroup = computed(() =>
    groups.value.find(g => g.groupId === selectedGroupId.value)
  )

  function setGroups(list: Group[]) {
    groups.value = list
  }

  function addOrUpdateGroup(group: Group) {
    const idx = groups.value.findIndex(g => g.groupId === group.groupId)
    if (idx >= 0) {
      groups.value[idx] = group
    } else {
      groups.value.unshift(group)
    }
  }

  function removeGroup(groupId: string) {
    groups.value = groups.value.filter(g => g.groupId !== groupId)
    if (selectedGroupId.value === groupId) {
      selectedGroupId.value = ''
      messages.value = []
    }
    delete unreadCounts.value[groupId]
  }

  function selectGroup(groupId: string) {
    selectedGroupId.value = groupId
    unreadCounts.value[groupId] = 0
  }

  function setMessages(groupId: string, records: ChatRecord[]) {
    if (selectedGroupId.value === groupId) {
      messages.value = records
    }
  }

  function addMessage(record: ChatRecord) {
    if (!record.groupId) return
    if (record.groupId !== selectedGroupId.value) {
      const current = unreadCounts.value[record.groupId] || 0
      unreadCounts.value[record.groupId] = current + 1
      return
    }
    messages.value.push(record)
  }

  function updateMessageStatus(messageId: string, status: string) {
    const msg = messages.value.find(m => m.id === messageId)
    if (msg) {
      msg.status = status as any
    }
  }

  function clearMessages() {
    messages.value = []
    selectedGroupId.value = ''
  }

  function getUnread(groupId: string): number {
    return unreadCounts.value[groupId] || 0
  }

  function incrementUnread(groupId: string) {
    const current = unreadCounts.value[groupId] || 0
    unreadCounts.value[groupId] = current + 1
  }

  function addPendingInvite(invite: PendingInvite) {
    // 去重（同一群同一邀请人只保留一条）
    const idx = pendingInvites.value.findIndex(
      i => i.groupId === invite.groupId && i.inviterPeerId === invite.inviterPeerId
    )
    if (idx >= 0) {
      pendingInvites.value[idx] = invite
    } else {
      pendingInvites.value.push(invite)
    }
  }

  function removePendingInvite(groupId: string, inviterPeerId: string) {
    pendingInvites.value = pendingInvites.value.filter(
      i => !(i.groupId === groupId && i.inviterPeerId === inviterPeerId)
    )
  }

  return {
    groups,
    selectedGroupId,
    messages,
    unreadCounts,
    pendingInvites,
    currentGroup,
    setGroups,
    addOrUpdateGroup,
    removeGroup,
    selectGroup,
    setMessages,
    addMessage,
    updateMessageStatus,
    clearMessages,
    getUnread,
    incrementUnread,
    addPendingInvite,
    removePendingInvite,
  }
})
