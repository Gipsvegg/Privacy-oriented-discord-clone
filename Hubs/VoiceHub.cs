using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace ikt201_project.Hubs;

// WebRTC signaling. Klienter negoatiater p2p her
[Authorize]
public class VoiceHub : Hub
{
    // Someone joined,  people already in the call will send offer
    public override async Task OnConnectedAsync()
    {
        await Clients.Others.SendAsync("UserJoined", Context.ConnectionId);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await Clients.Others.SendAsync("UserLeft", Context.ConnectionId);
    }

    // Passes a WebRTC message (offer, answer or ICE candidate)
    public async Task SendSignal(string connectionId, string data)
    {
        await Clients.Client(connectionId).SendAsync("Signal", Context.ConnectionId, data);
    }
}
