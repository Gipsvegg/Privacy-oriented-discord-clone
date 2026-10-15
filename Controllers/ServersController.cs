using System.Security.Claims;
using ikt201_project.Data;
using ikt201_project.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ikt201_project.Controllers;

[Authorize]
public class ServersController : Controller
{
    private readonly ApplicationDbContext _db;

    public ServersController(ApplicationDbContext db) => _db = db;

    /// <summary>Shows the empty "Create server" form.</summary>
    [HttpGet]
    public IActionResult Create() => View(new CreateServerViewModel());

    /// <summary>Saves the submitted form as a new server and opens it on the Homepage.</summary>
    [HttpPost, ValidateAntiForgeryToken] // the token blocks forms submitted from other websites
    public async Task<IActionResult> Create(CreateServerViewModel model)
    {
        if (!ModelState.IsValid) return View(model);

        var name = model.Name.Trim();
        var server = new Server
        {
            Name = name,
            Icon = MakeIcon(name),
            OwnerId = User.FindFirstValue(ClaimTypes.NameIdentifier)!,
            Categories = ServerTemplates.Build(model.Template)
        };

        _db.Servers.Add(server);
        await _db.SaveChangesAsync();

        return RedirectToAction("Homepage", "Dashboard", new { serverId = server.Id });
    }

    // Initials of the first two words, e.g. "My Community" -> "MC".
    private static string MakeIcon(string name) =>
        string.Concat(name.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Take(2)
            .Select(word => char.ToUpper(word[0])));
}