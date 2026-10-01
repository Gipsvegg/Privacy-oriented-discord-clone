using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using ikt201_project.Models;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using ikt201_project.Data;
using ikt201_project.Hubs;
using Microsoft.AspNetCore.SignalR;

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
    [Authorize]
    public IActionResult Homepage()
    {
        return View();
    }
    
    [Authorize]
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