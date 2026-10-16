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

    /// <summary>Renames a server. Only the owner can do this.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Edit(EditServerViewModel model)
    {
        var server = await FindOwnedServer(model.Id);
        if (server == null) return NotFound();

        if (!ModelState.IsValid) return Fail("The server name must be 2-32 characters.", server.Id);

        server.Name = model.Name.Trim();
        server.Icon = MakeIcon(server.Name);
        await _db.SaveChangesAsync();

        return BackToHomepage(server.Id);
    }

    /// <summary>Deletes a server Only the owner can do this.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Delete(int id)
    {
        var server = await FindOwnedServer(id);
        if (server == null) return NotFound();

        _db.Servers.Remove(server);
        await _db.SaveChangesAsync();

        return BackToHomepage();
    }

    // Returns the server only if it belongs to the logged-in user, otherwise null.
    private Task<Server?> FindOwnedServer(int id)
    {
        var userId = GetUserId();
        return _db.Servers.FirstOrDefaultAsync(s => s.Id == id && s.OwnerId == userId);
    }

    // Goes back to the Homepage, with the given server opened (or none if serverId is null).
    private IActionResult BackToHomepage(int? serverId = null) =>
        RedirectToAction("Homepage", "Dashboard", new { serverId });

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