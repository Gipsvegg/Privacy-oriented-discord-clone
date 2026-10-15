using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ikt201_project.Data.Migrations
{
    /// <inheritdoc />
    public partial class GroupInviteConversationFK : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_GroupInvites_ConversationId",
                table: "GroupInvites",
                column: "ConversationId");

            migrationBuilder.AddForeignKey(
                name: "FK_GroupInvites_Conversations_ConversationId",
                table: "GroupInvites",
                column: "ConversationId",
                principalTable: "Conversations",
                principalColumn: "ConversationId",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_GroupInvites_Conversations_ConversationId",
                table: "GroupInvites");

            migrationBuilder.DropIndex(
                name: "IX_GroupInvites_ConversationId",
                table: "GroupInvites");
        }
    }
}
