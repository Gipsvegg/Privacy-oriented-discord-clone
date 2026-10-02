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
    private readonly IHubContext<ChatHub> _hub;
    
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
    //[ValidateAntiForgeryToken] ADD THIS LATER
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

    public record UploadKeyPackageRequest(byte[] KeyPackage);
    
    [HttpPost]
    public IActionResult UploadKeyPackage([FromBody] UploadKeyPackageRequest request)
    {
        if (request?.KeyPackage == null || request.KeyPackage.Length == 0) return BadRequest();

        var exists = _db.KeyPackages.Find(CurrentUserId);
        if (exists == null)
        {
            _db.KeyPackages.Add(new KeyPackage { UserId =  CurrentUserId, Data = request.KeyPackage });
        }
        else
        {
            exists.Data = request.KeyPackage;
        }
        _db.SaveChanges();
        
        
        return Ok();
    }

    [HttpGet]
    public IActionResult DownloadKeyPackage(string userId)
    {
        if(string.IsNullOrWhiteSpace(userId)) return BadRequest();
        var keyPackage = _db.KeyPackages.Find(userId);
        if (keyPackage == null) return NotFound();
        
        return Ok(keyPackage.Data);
    }

    public record UploadWelcome(string ReceiverId, string ConversationId, byte[] Welcome);
    [HttpPost]
    public async Task<IActionResult> UploadGroupInvite([FromBody] UploadWelcome? welcome)
    {
        if (welcome == null || welcome?.Welcome == null || welcome.Welcome.Length == 0 || string.IsNullOrWhiteSpace(welcome.ReceiverId) || string.IsNullOrWhiteSpace(welcome.ConversationId)) return BadRequest(); 
        
        if (welcome.ReceiverId == CurrentUserId) return BadRequest();

        var exists = _db.GroupInvites.FirstOrDefault(m => (m.ReceiverId == welcome.ReceiverId && m.ConversationId == welcome.ConversationId)); 
        
        if (exists == null)
        {
            _db.GroupInvites.Add(new GroupInvite { ReceiverId = welcome.ReceiverId, SenderId = CurrentUserId, ConversationId = welcome.ConversationId, Data = welcome.Welcome, Timestamp = DateTime.UtcNow });
        }
        else
        {
            exists.Timestamp = DateTime.UtcNow;
            exists.SenderId = CurrentUserId;
            exists.Data = welcome.Welcome; 
        }
        
        await _db.SaveChangesAsync();
        
        await _hub.Clients.User(welcome.ReceiverId).SendAsync("ReceiveGroupInvite");
        
        return Ok();
    }
    
    public record SmallWelcome(int Id, string SenderId, string ConversationId, byte[] Data);
    [HttpGet]
    public IActionResult DownloadWelcome()
    {
        var welcomes = _db.GroupInvites
            .Where(m => m.ReceiverId == CurrentUserId)
            .Select(m => new SmallWelcome(m.Id, m.SenderId, m.ConversationId, m.Data))
            .ToList();
        
        return Ok(welcomes);
    }

    [HttpDelete]
    public IActionResult DeleteWelcome(int id)
    {
        _db.GroupInvites.RemoveRange(_db.GroupInvites.Where(m => m.Id == id && m.ReceiverId == CurrentUserId));
        _db.SaveChanges();
        
        return Ok();
    }
    
    //error? tok den bare fra HomeController
    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}