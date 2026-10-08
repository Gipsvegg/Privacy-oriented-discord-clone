// P2P Voice chat med WebRTC

const hub = new signalR.HubConnectionBuilder().withUrl("/voiceHub").build();

// STUN server. Forteller nettleseren public IP
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

let microphone = null;
const peers = {}; // En RTCPeerConnection per person i samtalen, key er SignalR connection id

const joinButton = document.getElementById("voice-join");
const leaveButton = document.getElementById("voice-leave");
const statusText = document.getElementById("voice-status");
const roomInput = document.getElementById("voice-room");
const peopleList = document.getElementById("voice-people");
const peopleBox = document.getElementById("voice-details");
const countText = document.getElementById("voice-count");

function updateCount() {
    countText.textContent = peopleList.children.length + " connected";
}

function createPeer(id, username) {
    const peer = new RTCPeerConnection(rtcConfig);
    peers[id] = peer;

    // Send our microphone to them
    microphone.getTracks().forEach(track => peer.addTrack(track, microphone));

    // Send them our ICE candidates
    peer.onicecandidate = event => {
        if (event.candidate) {
            hub.invoke("SendSignal", id, JSON.stringify({ candidate: event.candidate }));
        }
    };

    // Show them in the list and play their audio
    const item = document.createElement("li");
    item.id = "peer-" + id;
    const text = document.createElement("span");
    const audio = document.createElement("audio");
    audio.autoplay = true;
    item.append(text, audio);
    peopleList.append(item);
    updateCount();

    text.textContent = username + ": connecting";
    peer.onconnectionstatechange = () => text.textContent = username + ": " + peer.connectionState;
    peer.ontrack = event => audio.srcObject = event.streams[0];

    return peer;
}

function removePeer(id) {
    peers[id]?.close();
    delete peers[id];
    document.getElementById("peer-" + id)?.remove();
    updateCount();
}

// Someone joined the call, we send them an offer
hub.on("UserJoined", async (id, username) => {
    const peer = createPeer(id, username);
    await peer.setLocalDescription(await peer.createOffer());
    await hub.invoke("SendSignal", id, JSON.stringify({ description: peer.localDescription }));
});

// A message from someone else. an offer, an answer, or an ICE candidate
hub.on("Signal", async (id, username, data) => {
    const message = JSON.parse(data);

    if (message.description?.type === "offer") {
        const peer = createPeer(id, username);
        await peer.setRemoteDescription(message.description);
        await peer.setLocalDescription(await peer.createAnswer());
        await hub.invoke("SendSignal", id, JSON.stringify({ description: peer.localDescription }));
    } else if (message.description?.type === "answer") {
        await peers[id]?.setRemoteDescription(message.description);
    } else if (message.candidate) {
        await peers[id]?.addIceCandidate(message.candidate);
    }
});

hub.on("UserLeft", id => removePeer(id));

joinButton.addEventListener("click", async () => {
    const room = roomInput.value.trim() || "General";
    try {
        microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
        await hub.start();
        const ice = JSON.parse(await hub.invoke("GetIceServers"));
        if (ice.iceServers) rtcConfig.iceServers = ice.iceServers;
        await hub.invoke("JoinRoom", room);
        joinButton.disabled = true;
        leaveButton.disabled = false;
        roomInput.disabled = true;
        statusText.textContent = "In room: " + room;
        peopleBox.hidden = false;
        updateCount();
    } catch (error) {
        microphone?.getTracks().forEach(track => track.stop());
        statusText.textContent = "Could not join: " + error.message;
    }
});

leaveButton.addEventListener("click", async () => {
    await hub.stop();
    Object.keys(peers).forEach(removePeer);
    microphone.getTracks().forEach(track => track.stop());
    joinButton.disabled = false;
    leaveButton.disabled = true;
    roomInput.disabled = false;
    statusText.textContent = "Not in a call";
    peopleBox.hidden = true;
});
