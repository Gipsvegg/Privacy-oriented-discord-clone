using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using ikt201_project.Models;

namespace ikt201_project.Areas.Identity.Pages.Account.Manage;

public class AppearanceModel : PageModel
{
    public string CurrentTheme { get; set; } = "default";
    public void OnGet()
    {
        Request.Cookies.TryGetValue("theme", out string? theme);
        
        

        if (theme != null && Themes.ValidThemes.ContainsKey(theme))
        {
            CurrentTheme = theme;
        }
    }
    
    public IActionResult OnPost(string? chosenTheme)
    {
        
        if (chosenTheme == null || !Themes.ValidThemes.ContainsKey(chosenTheme)) return RedirectToPage();
        
        Response.Cookies.Append("theme", chosenTheme, new CookieOptions {
                Expires = DateTimeOffset.UtcNow.AddYears(1),
                HttpOnly =  true,
                SameSite =  SameSiteMode.Lax,
                IsEssential = true
        });

        return RedirectToPage();
    }
}