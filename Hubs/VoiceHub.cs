using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace ikt201_project.Hubs;

// WebRTC signaling. Klienter negoatiater p2p her
[Authorize]
public class VoiceHub : Hub
{
    private static readonly HttpClient _http = new HttpClient();
    private readonly IConfiguration _config;

    public VoiceHub(IConfiguration config)
    {
        _config = config;
    }

    // Henter TURN servere fra cloudflare
    public async Task<string> GetIceServers()
    {
        var keyId = _config["CloudflareTurn:KeyId"];
        var apiToken = _config["CloudflareTurn:ApiToken"];
        if (keyId == null || apiToken == null) return "{}";

        var request = new HttpRequestMessage(HttpMethod.Post, $"https://rtc.live.cloudflare.com/v1/turn/keys/{keyId}/credentials/generate-ice-servers");
        request.Headers.Add("Authorization", "Bearer " + apiToken);
        request.Content = JsonContent.Create(new { ttl = 86400 });

        var response = await _http.SendAsync(request);
        if (!response.IsSuccessStatusCode) return "{}";
        return await response.Content.ReadAsStringAsync();
    }

    // Someone joined a room, people already in the room will send offer
    public async Task JoinRoom(string room)
    {
        Context.Items["room"] = room;
        await Groups.AddToGroupAsync(Context.ConnectionId, room);
        await Clients.OthersInGroup(room).SendAsync("UserJoined", Context.ConnectionId, Context.User?.Identity?.Name);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (Context.Items.TryGetValue("room", out var room))
        {
            await Clients.OthersInGroup((string)room!).SendAsync("UserLeft", Context.ConnectionId);
        }
    }

    // Passes a WebRTC message (offer, answer or ICE candidate)
    public async Task SendSignal(string connectionId, string data)
    {
        await Clients.Client(connectionId).SendAsync("Signal", Context.ConnectionId, Context.User?.Identity?.Name, data);
    }
}
