using Microsoft.AspNetCore.Identity;
using ikt201_project.Data;

namespace ikt201_project.Areas.Identity.Pages.Account.Manage;

public static class TwoFactorCheck
{
    // true if 2fa is off or the code is ok
    public static async Task<bool> CheckCodeAsync(UserManager<ApplicationUser> userManager, ApplicationUser user, string? code)
    {
        if (!await userManager.GetTwoFactorEnabledAsync(user))
            return true;

        if (string.IsNullOrWhiteSpace(code))
            return false;

        code = code.Replace(" ", "");
        var authCode = code.Replace("-", "");
        if (await userManager.VerifyTwoFactorTokenAsync(user, userManager.Options.Tokens.AuthenticatorTokenProvider, authCode))
            return true;

        // recovery codes
        var result = await userManager.RedeemTwoFactorRecoveryCodeAsync(user, code);
        return result.Succeeded;
    }
}
