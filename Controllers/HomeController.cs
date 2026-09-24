using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using ikt201_project.Models;

namespace ikt201_project.Controllers;

public class HomeController : Controller
{
    public IActionResult Index()
    {
        /* Dette sender alltid brukeren til til dashboardet, vet ikke hvor bra det er.
        if (User.Identity?.IsAuthenticated == true)
        {
            return RedirectToAction("Homepage", "Dashboard");
        }
        */
        return View();
    }

    public IActionResult Privacy()
    {
        return View();
    }

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}