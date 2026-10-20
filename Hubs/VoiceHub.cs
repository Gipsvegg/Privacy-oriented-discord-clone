using System.Collections.Concurrent;
using ikt201_project.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace ikt201_project.Hubs;

// WebRTC signaling. Klienter negoatiater p2p her
[Authorize]
public class VoiceHub : Hub
{
    private static readonly HttpClient _http = new HttpClient();
    // connection id -> conversation id for alle som er i en samtale
    private static readonly ConcurrentDictionary<string, string> _inCall = new();
    private readonly IConfiguration _config;
    private readonly ApplicationDbContext _db;

    public VoiceHub(IConfiguration config, ApplicationDbContext db)
    {
        _config = config;
        _db = db;
    }

    // brukes i viewene for å vise hvor mange som er i samtalen
    public static int CountInCall(string conversationId)
    {
        return _inCall.Values.Count(c => c == conversationId);
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
    public async Task JoinRoom(string conversationId)
    {
        var isMember = await _db.ConversationMembers.AnyAsync(m => m.ConversationId == conversationId && m.MemberId == Context.UserIdentifier);
        if (!isMember) throw new HubException("You are not in this conversation");

        await LeaveRoom();
        _inCall[Context.ConnectionId] = conversationId;
        await Groups.AddToGroupAsync(Context.ConnectionId, conversationId);
        await Clients.OthersInGroup(conversationId).SendAsync("UserJoined", Context.ConnectionId, Context.User?.Identity?.Name);
        await SendCallCount(conversationId);
    }

    public async Task LeaveRoom()
    {
        if (!_inCall.TryRemove(Context.ConnectionId, out var conversationId)) return;

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, conversationId);
        await Clients.OthersInGroup(conversationId).SendAsync("UserLeft", Context.ConnectionId);
        await SendCallCount(conversationId);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await LeaveRoom();
    }

    // alle i gruppen/dm-en får vite hvor mange som er i samtalen
    private async Task SendCallCount(string conversationId)
    {
        var members = await _db.ConversationMembers
            .Where(m => m.ConversationId == conversationId)
            .Select(m => m.MemberId)
            .ToListAsync();
        await Clients.Users(members).SendAsync("CallCount", conversationId, CountInCall(conversationId));
    }

    // Passes a WebRTC message (offer, answer or ICE candidate), only to someone in the same call
    public async Task SendSignal(string connectionId, string data)
    {
        _inCall.TryGetValue(Context.ConnectionId, out var myCall);
        _inCall.TryGetValue(connectionId, out var theirCall);
        if (myCall == null || myCall != theirCall) return;

        await Clients.Client(connectionId).SendAsync("Signal", Context.ConnectionId, Context.User?.Identity?.Name, data);
    }
}
