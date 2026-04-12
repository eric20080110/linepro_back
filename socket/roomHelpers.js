function getDMRoomId(idA, idB) {
  const sorted = [idA.toString(), idB.toString()].sort()
  return `dm:${sorted[0]}_${sorted[1]}`
}

function getGroupRoomId(groupId) {
  return `group:${groupId}`
}

module.exports = { getDMRoomId, getGroupRoomId }
