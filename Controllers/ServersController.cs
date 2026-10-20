using System.Security.Claims;
using ikt201_project.Data;
using ikt201_project.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ikt201_project.Controllers;

[Authorize]
public class ServersController : Controller
{
    private readonly ApplicationDbContext _db;

    public ServersController(ApplicationDbContext db) => _db = db;

    /// <summary>Saves the "Create server" dialog as a new server and opens it on the Homepage.</summary>
    [HttpPost, ValidateAntiForgeryToken] // the token blocks forms submitted from other websites
    public async Task<IActionResult> Create(CreateServerViewModel model)
    {
        if (!ModelState.IsValid) return Fail("The server name must be 2-32 characters.");

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

        return BackToHomepage(server.Id);
    }

    /// <summary>Renames a server and adds any new categories to the end of its list. Owner only.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Edit(EditServerViewModel model)
    {
        var server = await FindOwnedServer(model.Id);
        if (server == null) return NotFound();

        if (!ModelState.IsValid) return Fail("The server name must be 2-32 characters.", server.Id);

        server.Name = model.Name.Trim();
        server.Icon = MakeIcon(server.Name);

        // Position of the last category; the "?? -1" covers a server that has none yet.
        var position = await _db.Categories
            .Where(c => c.ServerId == server.Id)
            .MaxAsync(c => (int?)c.Position) ?? -1;

        foreach (var raw in model.NewCategories)
        {
            var name = raw?.Trim();
            if (string.IsNullOrEmpty(name)) continue;

            _db.Categories.Add(new Category
            {
                ServerId = server.Id,
                Name = name.Length > 32 ? name[..32] : name, // the form already limits this; safeguard only
                Position = ++position
            });
        }

        await _db.SaveChangesAsync();
        return BackToHomepage(server.Id);
    }

    /// <summary>Deletes a server and, with it, its categories and channels. Owner only.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Delete(int id)
    {
        var server = await FindOwnedServer(id);
        if (server == null) return NotFound();

        _db.Servers.Remove(server);
        await _db.SaveChangesAsync();

        return BackToHomepage();
    }

    /// <summary>Renames a category. Owner of the server only.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> EditCategory(EditCategoryViewModel model)
    {
        var category = await FindOwnedCategory(model.Id);
        if (category == null) return NotFound();

        if (!ModelState.IsValid) return Fail("The category name must be 1-32 characters.", category.ServerId);

        category.Name = model.Name.Trim();
        await _db.SaveChangesAsync();

        return BackToHomepage(category.ServerId);
    }

    /// <summary>Deletes a category and all channels in it. Owner of the server only.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteCategory(int id)
    {
        var category = await FindOwnedCategory(id);
        if (category == null) return NotFound();

        _db.Categories.Remove(category);
        await _db.SaveChangesAsync();

        return BackToHomepage(category.ServerId);
    }

    /// <summary>Adds a channel to the end of a category and opens it. Owner of the server only.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> CreateChannel(CreateChannelViewModel model)
    {
        var category = await FindOwnedCategory(model.CategoryId);
        if (category == null) return NotFound();

        if (!ModelState.IsValid) return Fail("The channel name must be 1-32 characters.", category.ServerId);

        var lastPosition = await _db.Channels
            .Where(ch => ch.CategoryId == category.Id)
            .MaxAsync(ch => (int?)ch.Position) ?? -1;

        var channel = new Channel
        {
            CategoryId = category.Id,
            Name = model.Name.Trim(),
            Type = model.Type,
            ReadOnly = model.Type == ChannelType.Text && model.ReadOnly, // read-only only makes sense for text
            Position = lastPosition + 1
        };

        _db.Channels.Add(channel);
        await _db.SaveChangesAsync();

        return BackToHomepage(category.ServerId, channel.Id);
    }

    /// <summary>Renames a channel and sets whether it is read-only. Owner of the server only.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> EditChannel(EditChannelViewModel model)
    {
        var owned = await FindOwnedChannel(model.Id);
        if (owned == null) return NotFound();

        if (!ModelState.IsValid) return Fail("The channel name must be 1-32 characters.", owned.ServerId);

        owned.Channel.Name = model.Name.Trim();
        if (owned.Channel.Type == ChannelType.Text) owned.Channel.ReadOnly = model.ReadOnly;
        await _db.SaveChangesAsync();

        return BackToHomepage(owned.ServerId, owned.Channel.Id);
    }

    /// <summary>Deletes a channel. Owner of the server only.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteChannel(int id)
    {
        var owned = await FindOwnedChannel(id);
        if (owned == null) return NotFound();

        _db.Channels.Remove(owned.Channel);
        await _db.SaveChangesAsync();

        return BackToHomepage(owned.ServerId);
    }

    /// <summary>
    /// Saves the order from dragging: the position of every category, and which category
    /// each channel is in plus its position there. Called by JavaScript, so it returns no page.
    /// Owner of the server only.
    /// </summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Reorder([FromBody] ReorderRequest? request)
    {
        if (request == null) return BadRequest();

        var server = await FindOwnedServer(request.ServerId);
        if (server == null) return NotFound();

        // Everything the server contains. Ids in the request that aren't in here are rejected,
        // so a request can't move things into or out of someone else's server.
        var categories = await _db.Categories
            .Include(c => c.Channels)
            .Where(c => c.ServerId == server.Id)
            .ToListAsync();

        var categoriesById = categories.ToDictionary(c => c.Id);
        var channelsById = categories.SelectMany(c => c.Channels).ToDictionary(ch => ch.Id);

        // Go through the categories in the order the browser sent them (top to bottom in the sidebar).
        // For each category, save its new position and the new position of every channel inside it.
        for (var i = 0; i < request.Categories.Count; i++)
        {
            var item = request.Categories[i];
            if (!categoriesById.TryGetValue(item.Id, out var category)) return BadRequest();

            category.Position = i;

            for (var j = 0; j < item.ChannelIds.Count; j++)
            {
                if (!channelsById.TryGetValue(item.ChannelIds[j], out var channel)) return BadRequest();

                channel.CategoryId = category.Id; // changes category if the channel was dragged into another one
                channel.Position = j;
            }
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // A channel together with the id of the server it belongs to.
    private record OwnedChannel(Channel Channel, int ServerId);

    // Returns the server only if it belongs to the logged-in user, otherwise null.
    private Task<Server?> FindOwnedServer(int id)
    {
        var userId = GetUserId();
        return _db.Servers.FirstOrDefaultAsync(s => s.Id == id && s.OwnerId == userId);
    }

    // Returns the category only if its server belongs to the logged-in user, otherwise null.
    private Task<Category?> FindOwnedCategory(int id)
    {
        var userId = GetUserId();
        return _db.Categories.FirstOrDefaultAsync(c =>
            c.Id == id && _db.Servers.Any(s => s.Id == c.ServerId && s.OwnerId == userId));
    }

    // Returns the channel only if its server belongs to the logged-in user, otherwise null.
    // Channels don't link to servers directly, so this goes through the category.
    private Task<OwnedChannel?> FindOwnedChannel(int id)
    {
        var userId = GetUserId();
        return (from ch in _db.Channels
                join c in _db.Categories on ch.CategoryId equals c.Id
                join s in _db.Servers on c.ServerId equals s.Id
                where ch.Id == id && s.OwnerId == userId
                select new OwnedChannel(ch, s.Id)).FirstOrDefaultAsync();
    }

    // Goes back to the Homepage, with the given server and channel opened
    private IActionResult BackToHomepage(int? serverId = null, int? channelId = null) =>
        RedirectToAction("Homepage", "Dashboard", new { serverId, channelId });

    // Goes back to the Homepage and shows an error message there (read from TempData in the view).
    private IActionResult Fail(string message, int? serverId = null)
    {
        TempData["ServerError"] = message;
        return BackToHomepage(serverId);
    }

    private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    // Initials of the first two words, e.g. "My Community" -> "MC".
    private static string MakeIcon(string name) =>
        string.Concat(name.Split(' ', StringSplitOptions.RemoveEmptyEntries)
                          .Take(2)
                          .Select(word => char.ToUpper(word[0])));
}