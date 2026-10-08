using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace ikt201_project.Hubs;

[Authorize]
public class FriendsHub : Hub
{
}