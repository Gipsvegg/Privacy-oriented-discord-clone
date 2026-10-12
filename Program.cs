using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ikt201_project.Data;
using ikt201_project.Data.BackgroundTasks;
using ikt201_project.Hubs;



var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection") ??
                       throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlite(connectionString));
builder.Services.AddDatabaseDeveloperPageExceptionFilter();

builder.Services.AddDefaultIdentity<ApplicationUser>(options => options.SignIn.RequireConfirmedAccount = true)
    .AddRoles<IdentityRole>()
    .AddEntityFrameworkStores<ApplicationDbContext>();
builder.Services.AddControllersWithViews();
builder.Services.AddSignalR();
builder.Services.AddHostedService<DeleteOldMessagesFromDatabase>();

var app = builder.Build();

// For reverse proxy
app.UseForwardedHeaders(new ForwardedHeadersOptions { ForwardedHeaders = ForwardedHeaders.XForwardedProto });

if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    db.Database.Migrate();
    //Console.ForegroundColor = ConsoleColor.Red;
    //Console.Out.WriteLine("THE DATABASE TABLE FOR MESSAGES IS GETTING DELETED");
    //Console.ResetColor();

    ApplicationUser user;
    var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
    if (db.Users.Find("f3746277-afdb-4cef-9da0-149068536ebb") == null)
    {
        user = new ApplicationUser
        {
            Id = "f3746277-afdb-4cef-9da0-149068536ebb",
            UserName = "admin",
            Email = "admin@test.com",
            EmailConfirmed = true
        };
        var result = await userManager.CreateAsync(user, "Test123!");
        if (!result.Succeeded)
            Console.WriteLine("Seeding failed: " + string.Join(", ", result.Errors.Select(e => e.Description)));
    }

    if (db.Users.Find("8b619ee5-5e13-4154-9843-582bfee5b97c") == null)
    {
        user = new ApplicationUser
        {
            Id = "8b619ee5-5e13-4154-9843-582bfee5b97c",
            UserName = "test",
            Email = "test@test.no",
            EmailConfirmed = true
        };
        var result = await userManager.CreateAsync(user, "Test123!");
        if (!result.Succeeded)
            Console.WriteLine("Seeding failed: " + string.Join(", ", result.Errors.Select(e => e.Description)));
    }
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseMigrationsEndPoint();
}
else
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();

app.MapStaticAssets();

app.MapControllerRoute(
        name: "default",
        pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();

app.MapRazorPages()
    .WithStaticAssets();

app.MapHub<VoiceHub>("/voiceHub");
app.MapHub<ChatHub>("/chathub");

app.Run();