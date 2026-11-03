using Microsoft.EntityFrameworkCore;
using ikt201_project.Data;
using ikt201_project.Models;

namespace ikt201_project.Services;

public class FriendService : IFriendService
{
    private readonly ApplicationDbContext _db;

    public FriendService(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task SendRequestAsync(string userId, string targetUsername)
    {
        var target = await _db.Users
            .FirstOrDefaultAsync(u => u.UserName == targetUsername);

        // Same silent result whether or not the user exists (prevents username enumeration)
        if (target == null || target.Id == userId) return;

        var existing = await _db.Friendships.FirstOrDefaultAsync(f =>
            (f.RequesterId == userId && f.AddresseeId == target.Id) ||
            (f.RequesterId == target.Id && f.AddresseeId == userId));

        if (existing != null)
        {
            // They already sent you a request: sending one back accepts it
            if (existing.Status == FriendshipStatus.Pending && existing.AddresseeId == userId)
            {
                existing.Status = FriendshipStatus.Accepted;
                await _db.SaveChangesAsync();
            }
            // Already friends, already pending, or blocked: do nothing
            return;
        }

        _db.Friendships.Add(new Friendship
        {
            RequesterId = userId,
            AddresseeId = target.Id,
            Status = FriendshipStatus.Pending
        });
        await _db.SaveChangesAsync();
    }

    public async Task<string> AcceptRequestAsync(string userId, int requestId)
    {
        var request = await _db.Friendships.FirstOrDefaultAsync(f =>
            f.Id == requestId &&
            f.AddresseeId == userId &&              // only the recipient can accept
            f.Status == FriendshipStatus.Pending);

        if (request == null) return "";

        request.Status = FriendshipStatus.Accepted;
        await _db.SaveChangesAsync();
        
        return request.RequesterId;
    }

    public async Task<string> DeclineRequestAsync(string userId, int requestId)
    {
        var request = await _db.Friendships.FirstOrDefaultAsync(f =>
            f.Id == requestId &&
            f.Status == FriendshipStatus.Pending &&
            (f.AddresseeId == userId || f.RequesterId == userId)); // decline or cancel

        if (request == null) return "";

        _db.Friendships.Remove(request);
        await _db.SaveChangesAsync();
        return userId != request.AddresseeId ? request.AddresseeId : request.RequesterId;
    }

    public async Task RemoveFriendAsync(string userId, string friendId)
    {
        var friendship = await _db.Friendships.FirstOrDefaultAsync(f =>
            f.Status == FriendshipStatus.Accepted &&
            ((f.RequesterId == userId && f.AddresseeId == friendId) ||
             (f.RequesterId == friendId && f.AddresseeId == userId)));

        if (friendship == null) return;

        _db.Friendships.Remove(friendship);
        await _db.SaveChangesAsync();
    }

    public async Task<List<ApplicationUser>> GetFriendsAsync(string userId)
    {
        return await _db.Friendships
            .Where(f => f.Status == FriendshipStatus.Accepted &&
                        (f.RequesterId == userId || f.AddresseeId == userId))
            .Select(f => f.RequesterId == userId ? f.Addressee : f.Requester)
            .ToListAsync();
    }

    public async Task<List<Friendship>> GetIncomingAsync(string userId)
    {
        return await _db.Friendships
            .Include(f => f.Requester)
            .Where(f => f.AddresseeId == userId && f.Status == FriendshipStatus.Pending)
            .ToListAsync();
    }

    public async Task<List<Friendship>> GetOutgoingAsync(string userId)
    {
        return await _db.Friendships
            .Include(f => f.Addressee)
            .Where(f => f.RequesterId == userId && f.Status == FriendshipStatus.Pending)
            .ToListAsync();
    }
}