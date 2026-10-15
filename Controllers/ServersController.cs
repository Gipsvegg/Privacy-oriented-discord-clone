using System.Security.Claims;
using ikt201_project.Data; // TODO: change this if your DbContext lives in another namespace
using ikt201_project.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ikt201_project.Controllers;

// Only logged-in users can reach this controller, everyone else is sent to the login page.
[Authorize]
public class ServersController : Controller
{
    private readonly ApplicationDbContext _db;

    // ASP.NET passes in the database context automatically (dependency injection). ???
    public ServersController(ApplicationDbContext db) => _db = db;

    // Shows the servers page for one server and one channel
    public async Task<IActionResult> Index(int? id = null, int? channelId = null)
    {
        var userId = GetUserId();

        // Only the servers this user owns
        var servers = await _db.Servers
            .Where(s => s.OwnerId == userId)
            .OrderBy(s => s.Id)
            .ToListAsync();

        if (servers.Count == 0) return RedirectToAction(nameof(Create));  // Redirect user to create page


        var serverId = id ?? servers[0].Id;

        // Load the chosen server with its categories and channels, in saved order.
        // Filtering by OwnerId stops users from opening other people's servers via the URL.
        var currentServer = await _db.Servers
            .Include(s => s.Categories.OrderBy(c => c.Position))
                .ThenInclude(c => c.Channels.OrderBy(ch => ch.Position))
            .FirstOrDefaultAsync(s => s.Id == serverId && s.OwnerId == userId);

        if (currentServer == null) return NotFound();

        var channels = currentServer.Categories.SelectMany(c => c.Channels).ToList();

        // If no channel was requested (or the id doesn't match), fall back to the
        // first text channel so the user never lands on an empty page.
        var channel = channels.FirstOrDefault(c => c.Id == channelId)
                      ?? channels.FirstOrDefault(c => c.Type == ChannelType.Text);

        return View(new ServersViewModel
        {
            Servers = servers,
            CurrentServer = currentServer,
            CurrentChannel = channel
        });
    }

    //Shows the empty "Create server" form.
    [HttpGet]
    public IActionResult Create() => View(new CreateServerViewModel());

    //Saves the submitted form as a new server and opens it.
    [HttpPost, ValidateAntiForgeryToken] // the token blocks forms submitted from other websites
    public async Task<IActionResult> Create(CreateServerViewModel model)
    {
        // Redisplay the form with error messages if validation failed.
        if (!ModelState.IsValid) return View(model);

        var name = model.Name.Trim();
        var server = new Server
        {
            Name = name,
            Icon = MakeIcon(name),
            OwnerId = GetUserId(),
            Categories = ServerTemplates.Build(model.Template)
        };

        _db.Servers.Add(server);
        await _db.SaveChangesAsync();

        return RedirectToAction(nameof(Index), new { id = server.Id });
    }

    // Id of the logged-in user
    private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    // Initials of the first two words, e.g. "My Community" -> "MC".
    private static string MakeIcon(string name) =>
        string.Concat(name.Split(' ', StringSplitOptions.RemoveEmptyEntries)
                          .Take(2)
                          .Select(word => char.ToUpper(word[0])));
}