using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Authorization;

namespace ikt201_project.Hubs;

[Authorize]
public class ChatHub : Hub
{
    
}