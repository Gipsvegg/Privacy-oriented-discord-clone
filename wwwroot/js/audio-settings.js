// Audio settings, saves in localstorage, used by voice-chat.js

const inputSelect = document.getElementById("audio-input");
const outputSelect = document.getElementById("audio-output");
const outputVolume = document.getElementById("output-volume");
const showDevicesButton = document.getElementById("show-devices");
const message = document.getElementById("audio-message");
const canChooseSpeaker = "setSinkId" in HTMLMediaElement.prototype;

async function listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    inputSelect.innerHTML = '<option value="">System default</option>';
    outputSelect.innerHTML = '<option value="">System default</option>';

    devices.forEach(device => {
        if (!device.label || device.deviceId === "default") return;
        if (device.kind === "audioinput") inputSelect.add(new Option(device.label, device.deviceId));
        if (device.kind === "audiooutput") outputSelect.add(new Option(device.label, device.deviceId));
    });

    inputSelect.value = localStorage.getItem("audio-input") ?? "";
    outputSelect.value = localStorage.getItem("audio-output") ?? "";
    // if the saved device is gone, system default
    if (!inputSelect.value) inputSelect.value = "";
    if (!outputSelect.value) outputSelect.value = "";

    showDevicesButton.hidden = devices.some(device => device.label);
}

showDevicesButton.addEventListener("click", async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        message.hidden = true;
        await listDevices();
    } catch {
        message.textContent = "Microphone is blocked, allow it in the browser settings";
        message.hidden = false;
    }
});

inputSelect.addEventListener("change", () => localStorage.setItem("audio-input", inputSelect.value));
outputSelect.addEventListener("change", () => localStorage.setItem("audio-output", outputSelect.value));
outputVolume.addEventListener("input", () => localStorage.setItem("output-volume", outputVolume.value));

// plays ring sound for a few seconds
document.getElementById("test-speakers").addEventListener("click", async () => {
    const sound = new Audio("/sounds/ring.wav");
    sound.volume = outputVolume.value / 100;
    if (canChooseSpeaker && outputSelect.value) await sound.setSinkId(outputSelect.value);
    sound.play();
    setTimeout(() => sound.pause(), 3000);
});

outputVolume.value = localStorage.getItem("output-volume") ?? 100;
if (!canChooseSpeaker) {
    outputSelect.disabled = true;
    document.getElementById("no-speaker-select").hidden = false;
}
listDevices();
