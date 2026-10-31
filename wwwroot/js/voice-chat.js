// P2P Voice chat med WebRTC

// Reconnect attempt
const hub = new signalR.HubConnectionBuilder().withUrl("/voiceHub").withAutomaticReconnect().build();

// Bare TURN, for å gjemme IP
const rtcConfig = { iceServers: [], iceTransportPolicy: "relay" };

let microphone = null;
let currentCall = null; // conversation id til samtalen vi er i
let muted = false;
let deafened = false;
let ringingCall = null;
let ringTimeout = null;
const peers = {}; // En RTCPeerConnection per person i samtalen, key er SignalR connection id

const muteButton = document.getElementById("voice-mute");
const deafenButton = document.getElementById("voice-deafen");
const leaveButton = document.getElementById("voice-leave");
const statusText = document.getElementById("voice-status");
const peopleList = document.getElementById("voice-people");
const peopleCount = document.getElementById("voice-count");
const inCallBox = document.getElementById("voice-in-call");
const callNameText = document.getElementById("voice-call-name");
const incomingBox = document.getElementById("incoming-call");
const incomingText = document.getElementById("incoming-text");
const myName = document.getElementById("uuid")?.dataset.username;

const ringSound = new Audio("/sounds/bass_ring.mp3");
ringSound.loop = true;
const ringSeconds = 30; // hvor lenge det ringer før lyden stopper

function showStatus(text, isError = false) {
    statusText.hidden = false;
    statusText.textContent = text;
    statusText.classList.toggle("voice-error", isError);
}

function updatePeopleCount() {
    peopleCount.textContent = peopleList.children.length;
}

// use speakers and volume from audio settings
function applySpeaker(audio, volume = 1) {
    audio.volume = volume * Number(localStorage.getItem("output-volume") ?? 100) / 100;
    const speaker = localStorage.getItem("audio-output");
    if (speaker && audio.setSinkId) audio.setSinkId(speaker).catch(console.error);
}

function chatName(conversationId) {
    return document.querySelector(`.sidebar a.friend[data-conversation-id="${conversationId}"]`)?.firstChild.textContent.trim();
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

    // Show them in the list with a volume slider, and play their audio
    const item = document.createElement("li");
    item.id = "peer-" + id;
    const name = document.createElement("div");
    name.textContent = username;
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.muted = deafened;

    // remember per person volume
    const volume = document.createElement("input");
    volume.type = "range";
    volume.className = "form-range";
    volume.title = "Volume for " + username;
    volume.value = localStorage.getItem("volume-" + username) ?? 100;
    volume.addEventListener("input", () => {
        localStorage.setItem("volume-" + username, volume.value);
        applySpeaker(audio, volume.value / 100);
    });
    applySpeaker(audio, volume.value / 100);

    item.append(name, volume, audio);
    peopleList.append(item);
    updatePeopleCount();

    // grå mens den kobler til, rød når error
    const showState = () => {
        if (peer.connectionState === "connected") item.className = "";
        else if (peer.connectionState === "failed") item.className = "failed";
        else item.className = "connecting";
    };
    showState();
    peer.onconnectionstatechange = showState;
    peer.ontrack = event => audio.srcObject = event.streams[0];

    return peer;
}

function removePeer(id) {
    peers[id]?.close();
    delete peers[id];
    document.getElementById("peer-" + id)?.remove();
    updatePeopleCount();
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

// Someone joined or left a call in one of our chats, update the number next to it
hub.on("CallChanged", (conversationId, names) => {
    const counts = document.querySelectorAll(`.call-count[data-conversation-id="${conversationId}"]`);
    const isDm = counts[0]?.classList.contains("dm");

    // ring when call started
    if (counts[0]?.hidden && names.length > 0 && !names.includes(myName)) {
        startRinging(conversationId, isDm ? names[0] + " is calling you" : names[0] + " started a call in " + chatName(conversationId));
    }

    if (conversationId === ringingCall && (names.length === 0 || names.includes(myName))) {
        stopRinging();
    }

    counts.forEach(element => {
        element.textContent = isDm ? "" : names.length;
        element.title = "In call: " + names.join(", ");
        element.hidden = names.length === 0;
    });
    updateCallUI();
});

function startRinging(conversationId, text) {
    ringingCall = conversationId;
    incomingText.textContent = text;
    incomingBox.classList.add("open");
    ringSound.currentTime = 0;
    applySpeaker(ringSound);
    ringSound.play().catch(() => {});
    clearTimeout(ringTimeout);
    ringTimeout = setTimeout(() => ringSound.pause(), ringSeconds * 1000);
}

function stopRinging() {
    ringingCall = null;
    incomingBox.classList.remove("open");
    ringSound.pause();
    clearTimeout(ringTimeout);
}

// headset icon on current voice chat
function updateCallUI() {
    document.querySelectorAll(".call-count").forEach(element => {
        element.classList.toggle("mine", element.dataset.conversationId === currentCall);
    });

    const button = document.getElementById("call-button");
    if (!button) return;
    const someoneInCall = !document.querySelector(".call-info .call-count").hidden;

    if (button.dataset.conversationId === currentCall) {
        button.className = "btn btn-sm btn-danger";
        button.innerHTML = '<i class="bi bi-telephone-x-fill"></i> Leave';
    } else if (someoneInCall) {
        button.className = "btn btn-sm btn-success";
        button.innerHTML = '<i class="bi bi-telephone-fill"></i> Join';
    } else {
        button.className = "btn btn-sm btn-outline-success";
        button.innerHTML = '<i class="bi bi-telephone-fill"></i> Call';
    }
}

function setMuted(value) {
    muted = value;
    microphone?.getAudioTracks().forEach(track => track.enabled = !muted);
    muteButton.className = muted ? "btn btn-sm btn-warning" : "btn btn-sm btn-outline-secondary";
    muteButton.title = muted ? "Unmute" : "Mute";
    muteButton.innerHTML = muted ? '<i class="bi bi-mic-mute-fill"></i>' : '<i class="bi bi-mic-fill"></i>';
}

function setDeafened(value) {
    deafened = value;
    peopleList.querySelectorAll("audio").forEach(audio => audio.muted = deafened);
    setMuted(deafened);
    deafenButton.className = deafened ? "btn btn-sm btn-danger" : "btn btn-sm btn-outline-secondary";
    deafenButton.title = deafened ? "Undeafen" : "Deafen";
    deafenButton.innerHTML = deafened ? '<i class="bi bi-volume-mute-fill"></i>' : '<i class="bi bi-headphones"></i>';
}

async function joinCall(conversationId) {
    if (currentCall) await leaveCall();
    try {
        const mic = localStorage.getItem("audio-input");
        microphone = await navigator.mediaDevices.getUserMedia({ audio: mic ? { deviceId: mic } : true });
    } catch (error) {
        if (error.name === "NotAllowedError") showStatus("Microphone is blocked, allow it in the browser to join", true);
        else if (error.name === "NotFoundError") showStatus("No microphone found", true);
        else showStatus("Could not use your microphone", true);
        return;
    }
    try {
        if (hub.state === "Disconnected") await hub.start();
        const ice = JSON.parse(await hub.invoke("GetIceServers"));
        if (!ice.iceServers) throw new Error("TURN server is not set up");
        rtcConfig.iceServers = ice.iceServers;
        await hub.invoke("JoinRoom", conversationId);
        currentCall = conversationId;
        callNameText.textContent = chatName(conversationId);
        statusText.hidden = true;
        inCallBox.classList.add("open")
        updateCallUI();
    } catch (error) {
        console.error(error);
        microphone.getTracks().forEach(track => track.stop());
        // feilmeldinger fra serveren kommer etter "HubException: "
        if (error.message.includes("HubException: ")) showStatus(error.message.split("HubException: ")[1], true);
        else showStatus("Could not join the call, try again", true);
    }
}

async function leaveCall() {
    if (hub.state === "Connected") await hub.invoke("LeaveRoom");
    Object.keys(peers).forEach(removePeer);
    setDeafened(false);
    microphone.getTracks().forEach(track => track.stop());
    currentCall = null;
    statusText.hidden = true;
    inCallBox.classList.remove("open");
    updateCallUI();
}

// the call button in the chat
document.addEventListener("click", async e => {
    const button = e.target.closest("#call-button");
    if (!button) return;
    button.disabled = true;
    if (button.dataset.conversationId === currentCall) await leaveCall();
    else await joinCall(button.dataset.conversationId);
    button.disabled = false;
});

// update ui when sidebar changes
const observer = new MutationObserver(updateCallUI);
["message-area", "friends-list", "groups-list"].forEach(id => observer.observe(document.getElementById(id), { childList: true }));

// asks before you leave the page
window.addEventListener("beforeunload", e => {
    if (currentCall) e.preventDefault();
});

// join from sidebar
document.getElementById("incoming-join").addEventListener("click", async () => {
    const conversationId = ringingCall;
    stopRinging();
    document.querySelector(`.sidebar a.friend[data-conversation-id="${conversationId}"]`)?.click();
    await joinCall(conversationId);
});

document.getElementById("incoming-ignore").addEventListener("click", stopRinging);
muteButton.addEventListener("click", () => setMuted(!muted));
deafenButton.addEventListener("click", () => setDeafened(!deafened));
leaveButton.addEventListener("click", leaveCall);

// leave call if kicked from group
connection.on("RemoveFromGroup", async conversationId => {
    if (conversationId === currentCall) await leaveCall();
});

// leave call if we leave group
document.addEventListener("click", async e => {
    const button = e.target.closest("#open-group-leaver");
    if (button && button.dataset.conversationId === currentCall) await leaveCall();
});

// lost the connection to the server
hub.onreconnecting(() => {
    if (currentCall) showStatus("Connection lost, reconnecting...", true);
});

hub.onreconnected(async () => {
    refreshFriendsList();
    refreshGroupsList();
    if (!currentCall) return;
    try {
        Object.keys(peers).forEach(removePeer);
        await hub.invoke("JoinRoom", currentCall);
        statusText.hidden = true;
    } catch (error) {
        console.error(error);
        await leaveCall();
        showStatus("Could not rejoin the call", true);
    }
});

// gave up reconnecting
hub.onclose(async () => {
    if (!currentCall) return;
    await leaveCall();
    showStatus("Lost connection to the server, try joining again", true);
});

hub.start().catch(console.error);
