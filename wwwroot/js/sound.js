// @ts-check

const sounds = {
    buttonPress: new Audio("/sounds/button_click2.mp3"),
    mute: new Audio("/sounds/mute_self.mp3"),
    unmute: new Audio("/sounds/unmute_self2.mp3"),
    deafen: new Audio("/sounds/deafen.mp3"),
    undeafen: new Audio("/sounds/undeafen.mp3"),
    joinedGroup: new Audio("/sounds/group_joined.mp3"),
    receivedMessage: new Audio("/sounds/message_received.mp3"),//received in background
    sentMessage: new Audio("/sounds/message_sent.mp3"),//message sent or received in conversation
    incomingFriend: new Audio("/sounds/friend_request_received.mp3"),
    acceptedFriend: new Audio("/sounds/friend_request_accept.wav"),
    rejectedFriend: new Audio("/sounds/friend_request_reject.wav"),
    abandonedFriend: new Audio("/sounds/friend_request_abandon.mp3"),
    callJoined: new Audio("/sounds/voice_chat_join.wav"),
    callLeft: new Audio("/sounds/voice_chat_left.wav"),
}

function playSound(name) {
    const soundElement = sounds[name];
    soundElement.currentTime = 0;
    applySpeaker(soundElement);
    soundElement.play().catch(() => {});
}


// use speakers and volume from audio settings
function applySpeaker(audio, volume = 1) {
    audio.volume = volume * Number(localStorage.getItem("output-volume") ?? 100) / 100;
    const speaker = localStorage.getItem("audio-output");
    if (speaker && audio.setSinkId) audio.setSinkId(speaker).catch(console.error);
}