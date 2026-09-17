using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using ikt201_project.Models;
using Microsoft.AspNetCore.Authorization;

namespace ikt201_project.Controllers;

public class DashboardController : Controller
{
    [Authorize]
    public IActionResult Homepage()
    {
        return View();
    }
    
    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}