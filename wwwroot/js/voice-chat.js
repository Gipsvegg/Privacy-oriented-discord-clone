// P2P Voice chat med WebRTC

const hub = new signalR.HubConnectionBuilder().withUrl("/voiceHub").build();

// STUN server. Forteller nettleseren public IP
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

let microphone = null;
const peers = {}; // En RTCPeerConnection per person i samtalen, key er SignalR connection id

const joinButton = document.getElementById("voice-join");
const leaveButton = document.getElementById("voice-leave");
const statusText = document.getElementById("voice-status");
const peopleList = document.getElementById("voice-people");

function createPeer(id) {
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

    // Use start of SignalR connection id as name
    const name = "User " + id.substring(0, 5);
    text.textContent = name + ": connecting";
    peer.onconnectionstatechange = () => text.textContent = name + ": " + peer.connectionState;
    peer.ontrack = event => audio.srcObject = event.streams[0];

    return peer;
}

function removePeer(id) {
    peers[id]?.close();
    delete peers[id];
    document.getElementById("peer-" + id)?.remove();
}

// Someone joined the call, we send them an offer
hub.on("UserJoined", async id => {
    const peer = createPeer(id);
    await peer.setLocalDescription(await peer.createOffer());
    await hub.invoke("SendSignal", id, JSON.stringify({ description: peer.localDescription }));
});

// A message from someone else. an offer, an answer, or an ICE candidate
hub.on("Signal", async (id, data) => {
    const message = JSON.parse(data);

    if (message.description?.type === "offer") {
        const peer = createPeer(id);
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
    try {
        microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
        await hub.start();
        joinButton.disabled = true;
        leaveButton.disabled = false;
        statusText.textContent = "In the call";
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
    statusText.textContent = "Not in a call";
});
