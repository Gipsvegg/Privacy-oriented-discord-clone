using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using ikt201_project.Models;

namespace ikt201_project.Controllers;

public class HomeController : Controller
{
    public IActionResult Index()
    {
        return View();
    }

    public IActionResult Privacy()
    {
        return View();
    }

    public IActionResult Homepage()
    {
        if (User.Identity != null)
        {
            if (User.Identity.IsAuthenticated)
            {
                return View();
            }
        }
        return View(Index());
    }

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}