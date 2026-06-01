import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Friend } from '@shared/types'

export const useFriendStore = defineStore('friend', () => {
  const friends = ref<Friend[]>([])
  const selectedPeerId = ref<string>('')

  function updateFriends(friendList: Friend[]) {
    friends.value = friendList
  }

  function addOrUpdateFriend(friend: Friend) {
    const idx = friends.value.findIndex((f) => f.peerId === friend.peerId)
    if (idx >= 0) {
      friends.value[idx] = friend
    } else {
      friends.value.push(friend)
    }
  }

  function setOffline(peerId: string) {
    const friend = friends.value.find((f) => f.peerId === peerId)
    if (friend) {
      friend.online = false
    }
  }

  function selectFriend(peerId: string) {
    selectedPeerId.value = peerId
  }

  function removeFriend(peerId: string) {
    const idx = friends.value.findIndex((f) => f.peerId === peerId)
    if (idx >= 0) {
      friends.value.splice(idx, 1)
    }
    // 如果删除的是当前选中的好友，清空选中状态
    if (selectedPeerId.value === peerId) {
      selectedPeerId.value = ''
    }
  }

  return { friends, selectedPeerId, updateFriends, addOrUpdateFriend, setOffline, selectFriend, removeFriend }
})
