using ikt201_project.Data;
using ikt201_project.Models;

namespace ikt201_project.Services;

public interface IFriendService
{
    Task SendRequestAsync(string userId, string targetUsername);
    Task<bool> AcceptRequestAsync(string userId, int requestId);
    Task<bool> DeclineRequestAsync(string userId, int requestId);
    Task RemoveFriendAsync(string userId, string friendId);
    Task<List<ApplicationUser>> GetFriendsAsync(string userId);
    Task<List<Friendship>> GetIncomingAsync(string userId);
    Task<List<Friendship>> GetOutgoingAsync(string userId);
}