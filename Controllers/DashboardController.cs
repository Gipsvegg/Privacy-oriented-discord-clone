using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using ikt201_project.Models;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using ikt201_project.Data;
using ikt201_project.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using NuGet.Packaging.Signing;

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
    //private List<Message> GetConversation(string friendId)
    //{
    //    var me = CurrentUserId;
    //    
    //    return _db.Messages
    //        .Where(m => (m.SenderId == me && m.ReceiverId == friendId) || (m.SenderId == friendId && m.ReceiverId == me))
    //        .OrderBy(m => m.Timestamp)
    //        .ToList();
    //}
    
    public IActionResult Homepage()
    {
        var groups = _db.Conversations
            .Where(m => m.ConversationMembers.Any(e => e.MemberId == CurrentUserId))
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => new Group ( 
                m.ConversationId,
                m.ConversationName, 
                m.ConversationMembers
                    .Select(e => new Member(e.Member.UserName, e.Role))
                    .ToArray()))
            .ToList();
        
        return View(groups);
    }
    
    
    public IActionResult Conversation(string id)
    {
        //Henter id-en til samtalen som er valgt i homepage
        ViewBag.conversationId = id;
        
        return PartialView();
    }

    public record SmallMessage(int Id, string ConversationId, string SenderId, string? SenderName, string ReceiverId, string Text, DateTime Timestamp);
    [HttpGet]
    public IActionResult Mailbox()
    {
        var userId = CurrentUserId;

        var messages = _db.Messages
            .Where(m => m.ReceiverId == userId)
            .OrderBy(m => m.Id)
            .Select(m => new SmallMessage(
                m.Id, 
                m.ConversationId,
                m.SenderId,
                m.Conversation.ConversationMembers
                    .Where(e => e.MemberId  == m.SenderId)
                    .Select(e => e.Member.UserName)
                    .FirstOrDefault(), 
                m.ReceiverId, 
                m.Text, 
                m.Timestamp))
            .ToList();
        
        return Ok(messages);
    }

    [HttpDelete]
    public IActionResult DeleteMessageFromDb(int id)
    {
        _db.Messages.RemoveRange(_db.Messages.Where(m => m.Id == id && m.ReceiverId == CurrentUserId));
        _db.SaveChanges();
        
        return Ok();
    }

    private void MessageHandler(string conversationId, string text, List<ConversationMember> members)
    {
        //var members = _db.ConversationMembers.Where(m => m.ConversationId == conversationId && m.MemberId != CurrentUserId).ToList();
        var time = DateTime.UtcNow;
        
        foreach (var member in members)
        {
            if (member.MemberId == CurrentUserId) continue;
            _db.Messages.Add(new Message
            {
                SenderId = CurrentUserId, 
                ReceiverId = member.MemberId, 
                ConversationId = conversationId, 
                Text = text, 
                Timestamp = time
            });
        }
    }
    
    //sender meldingen til serveren og setter den inn i databasen
    //[ValidateAntiForgeryToken] //ADD THIS LATER
    [HttpPost]
    public async Task<IActionResult> SendMessage(string conversationId, string text)
    {
        //om du sender ingenting blir du skutt
        if (string.IsNullOrWhiteSpace(text)) return BadRequest();
        if (string.IsNullOrWhiteSpace(conversationId)) return BadRequest();
        var members = _db.ConversationMembers.Where(m => m.ConversationId == conversationId).ToList();
        if (members.Count == 0) return NotFound();
        if (members.All(member => member.MemberId != CurrentUserId)) return Forbid();
        try
        {
            MessageHandler(conversationId, text, members);
            await _db.SaveChangesAsync();
        }
        catch (Exception e)
        {
            Console.WriteLine(e);
            throw;
        }
        
        foreach (var member in members)
        {
            if (member.MemberId == CurrentUserId) continue;
            await _hub.Clients.User(member.MemberId).SendAsync("ReceiveMessage");
        }
        
        return Ok();
    }

    public record CommitPackage(string ConversationId, int Epoch, string Commit);
    [HttpPost]
    public async Task<IActionResult> SubmitCommit([FromBody] CommitPackage commitPackage)
    {
        if (commitPackage?.Commit == null || commitPackage.Commit.Length == 0) return BadRequest();
        if (string.IsNullOrWhiteSpace(commitPackage.ConversationId)) return BadRequest();
        
        var conversation = await _db.Conversations.FindAsync(commitPackage.ConversationId);
        if (conversation == null) return NotFound();
        var members = _db.ConversationMembers.Where(m => m.ConversationId == conversation.ConversationId).ToList();
        if (members.All(member => member.MemberId != CurrentUserId))
        {
            return Forbid();
        }
        if (commitPackage.Epoch != conversation.Epoch) return Conflict();

        try
        {
            conversation.Epoch++;
            MessageHandler(commitPackage.ConversationId, commitPackage.Commit, members);
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException e)
        {
            Console.WriteLine(e);
            return Conflict();
        }
        
        foreach (var member in members)
        {
            if (member.MemberId == CurrentUserId) continue;
            await _hub.Clients.User(member.MemberId).SendAsync("ReceiveMessage");
        }
        
        return Ok();
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

    [HttpGet]//downloads the public key package that a user has
    public IActionResult DownloadKeyPackage(string userId)
    {
        if(string.IsNullOrWhiteSpace(userId)) return BadRequest();
        var keyPackage = _db.KeyPackages.Find(userId);
        if (keyPackage == null) return NotFound();
        
        return Ok(keyPackage.Data);
    }

    public record CreateConversation(string ConversationId, string ConversationName);
    [HttpPost]
    public IActionResult ConversationCreation([FromBody] CreateConversation? request)
    {
        if(request == null || string.IsNullOrWhiteSpace(request.ConversationId) || string.IsNullOrWhiteSpace(request.ConversationName) || !Guid.TryParse(request.ConversationId, out var conversationId)) return BadRequest();
        if(_db.Conversations.Find(conversationId.ToString()) != null) return Conflict();
        try
        {
            
            _db.Conversations.Add(new Conversation { ConversationId = conversationId.ToString(), ConversationName = request.ConversationName, CreatedAt = DateTime.UtcNow, CreatorId = CurrentUserId, Epoch = 1});
            _db.ConversationMembers.Add(new ConversationMember {ConversationId = conversationId.ToString(), MemberId = CurrentUserId, JoinedAt = DateTime.UtcNow, Role = "admin"} );
            _db.SaveChanges();
        }
        catch (Exception e)
        {
            Console.WriteLine(e);
            throw;
        }
        
        return Ok();
    }

    public record UploadWelcome(string ReceiverId, string ConversationId, byte[] Welcome);
    [HttpPost]//Uploads the invitations to the group to the server
    public async Task<IActionResult> UploadGroupInvite([FromBody] UploadWelcome? welcome)
    {
        if (welcome == null || welcome?.Welcome == null || welcome.Welcome.Length == 0 || string.IsNullOrWhiteSpace(welcome.ReceiverId) || string.IsNullOrWhiteSpace(welcome.ConversationId) || welcome.ReceiverId == CurrentUserId) return BadRequest();
        if (await _db.Conversations.FindAsync(welcome.ConversationId) == null) return NotFound();
        if (await _db.ConversationMembers.FindAsync([welcome.ConversationId, CurrentUserId]) == null) return Forbid();
        try
        {
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

            if (await _db.ConversationMembers.FindAsync([welcome.ConversationId, welcome.ReceiverId]) == null)
            {
                _db.ConversationMembers.Add(new ConversationMember {ConversationId = welcome.ConversationId, JoinedAt = DateTime.UtcNow, MemberId = welcome.ReceiverId, Role = "default"});
            }
            
            await _db.SaveChangesAsync();
        }
        catch (Exception e)
        {
            Console.WriteLine(e);
            throw;
        }
        
        await _hub.Clients.User(welcome.ReceiverId).SendAsync("ReceiveGroupInvite");
        
        return Ok();
    }
    
    private record SmallWelcome(int Id, string SenderId, string ConversationId, byte[] Data);
    [HttpGet]//sends the group invitation to the user
    public IActionResult DownloadWelcome()
    {
        var welcomes = _db.GroupInvites
            .Where(m => m.ReceiverId == CurrentUserId)
            .Select(m => new SmallWelcome(m.Id, m.SenderId, m.ConversationId, m.Data))
            .ToList();
        
        return Ok(welcomes);
    }

    [HttpDelete]//deletes the welcome after it has been received
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