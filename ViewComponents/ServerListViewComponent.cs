using System.Security.Claims;
using ikt201_project.Data;
using ikt201_project.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ikt201_project.ViewComponents;

public class ServerListViewComponent : ViewComponent
{
    private readonly ApplicationDbContext _db;
    
    public ServerListViewComponent(ApplicationDbContext db)
    {
        _db = db;
    }
    
    public async Task<IViewComponentResult> InvokeAsync(int? serverId = null, int? channelId = null)
    {
        // The sidebar calls this component without arguments, so read the open server and channel from the URL.
        serverId ??= ReadQueryInt("serverId");
        channelId ??= ReadQueryInt("channelId");

        var userId = UserClaimsPrincipal.FindFirstValue(ClaimTypes.NameIdentifier);
        var servers = await _db.Servers
            .Where(s => s.OwnerId == userId)
            .OrderBy(s => s.Position).ThenBy(s => s.Id)
            .ToListAsync();

        var model = new HomepageViewModel { Servers = servers };

        if (serverId != null)
        {
            // Filtering by OwnerId stops users from opening other people's servers via the URL.
            var current = await _db.Servers
                .Include(s => s.Categories.OrderBy(c => c.Position))
                .ThenInclude(c => c.Channels.OrderBy(ch => ch.Position))
                .FirstOrDefaultAsync(s => s.Id == serverId && s.OwnerId == userId);

            // Unknown or someone else's server: show the list with everything closed.
            if (current == null) return View(model);

            var channels = current.Categories.SelectMany(c => c.Channels).ToList();
            model.CurrentServer = current;
            model.CurrentChannel = channels.FirstOrDefault(c => c.Id == channelId)
                                   ?? channels.FirstOrDefault(c => c.Type == ChannelType.Text);
        }

        return View(model);
    }

    // Reads a number from the query string (e.g. ?serverId=3). Returns null if it is missing or not a number.
    private int? ReadQueryInt(string key) =>
        int.TryParse(Request.Query[key].ToString(), out var value) ? value : null;
}