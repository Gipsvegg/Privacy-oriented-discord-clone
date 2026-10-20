using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using ikt201_project.Models;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using ikt201_project.Data;
using ikt201_project.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace ikt201_project.Controllers;

[Authorize]
public class DashboardController : Controller
{
    //Henter uuid til den som er logget inn
    private string CurrentUserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    
    //databasen
    private readonly ApplicationDbContext _db;
    
    //lar meldinger bli sett med engang isteden for å måtte reloade siden
    private IHubContext<ChatHub> _hub;
    
    public DashboardController(ApplicationDbContext db,  IHubContext<ChatHub> hub) //setter opp database og hub
    {
        _db = db;
        _hub = hub;
    }

    //Lager en liste med meldingene of sorterer dem etter tidspunkt
    private List<Message> GetConversation(string friendId)
    {
        var me = CurrentUserId;
        
        return _db.Messages
            .Where(m => (m.SenderId == me && m.ReceiverId == friendId) || (m.SenderId == friendId && m.ReceiverId == me))
            .OrderBy(m => m.Timestamp)
            .ToList();
    }
    
    /// <summary>
    /// Shows the homepage with the user's servers in the sidebar. If serverId is given, that
    /// server's channels are loaded too, with channelId (or the first text channel) selected.
    /// </summary>
    public async Task<IActionResult> Homepage(int? serverId = null, int? channelId = null)
    {
        var userId = CurrentUserId;

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

            if (current == null) return NotFound();

            var channels = current.Categories.SelectMany(c => c.Channels).ToList();
            model.CurrentServer = current;
            model.CurrentChannel = channels.FirstOrDefault(c => c.Id == channelId)
                                   ?? channels.FirstOrDefault(c => c.Type == ChannelType.Text);
        }

        return View(model);
    }
    
    public IActionResult Conversation(string id)
    {
        //Henter iden til vennen som er valgt i homepage
        ViewBag.FriendId = id;
        
        //sender tilbake alle meldingene mellom to personer
        return PartialView(GetConversation(id));
    }
    
    //sender meldingen til serveren og setter den inn i databasen
    [HttpPost]
    public async Task<IActionResult> SendMessage(string friendId, string text)
    {
        //om du sender ingenting blir du skutt
        if (string.IsNullOrWhiteSpace(text)) return BadRequest();

        //database ting
        _db.Messages.Add(new Message
        {
            SenderId = CurrentUserId,
            ReceiverId = friendId,
            Text = text,
            Timestamp = DateTime.UtcNow
        });
        _db.SaveChanges();

        //sjekker at en melding ikke blir sendt til seg selv
        if (friendId != CurrentUserId)
        {
            await _hub.Clients.User(friendId).SendAsync("ReceiveMessage", CurrentUserId, text);
        }

        //når man velger en venn i fanen blir det satt har sånn at man sender til riktig venn
        ViewBag.FriendId = friendId;
        
        
        return PartialView("Conversation", GetConversation(friendId));
    }
    
    //error? tok den bare fra HomeController
    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}