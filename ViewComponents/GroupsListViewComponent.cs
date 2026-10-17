using ikt201_project.Data;
using Microsoft.AspNetCore.Mvc;
using ikt201_project.Models;
using Microsoft.EntityFrameworkCore;


namespace ikt201_project.ViewComponents;

public class GroupsListViewComponent : ViewComponent
{
    private readonly ApplicationDbContext _db;
    
    public GroupsListViewComponent(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<IViewComponentResult> InvokeAsync()
    {
        var userId = UserClaimsPrincipal.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

        if (userId == null)
        {
            return View(new List<Group>());
        }
        
        var groups = await _db.Conversations
            .Where(m => m.ConversationMembers.Any(e => e.MemberId == userId) && !m.IsDirect)
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => new Group ( 
                m.ConversationId,
                m.ConversationName, 
                m.ConversationMembers
                    .Select(e => new Member(e.Member.UserName, e.Role))
                    .ToArray(),
                m.IsDirect))
            .ToListAsync();

        return View(groups);
    }
}