const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { MessageWriter } = require("../util/MessageWriter.js");
const prompts = require("../prompts.json");
const intros = require("../introductions.json");

module.exports = {
	data: new SlashCommandBuilder()
		.setName('kwiplash')
		.setDescription('Starts a new game of Kwiplash!'),
	async execute(interaction) {

		var username = interaction.user.username;
		await interaction.reply(`${username} wants to play Kwiplash!`);

        var guildId = interaction.guildId;

		if (guildId == null || guildId === "") {
			await interaction.reply("Kwiplash can only be summoned from a discord server.");
			return;
		}

		// pick an intro
		var introsCount = intros.length;
		var index = Math.floor(Math.random() * introsCount);
		var intro = intros[index];
		
		// replace any tags
		intro = intro.replace("{username}", username);
		intro = intro.replace("{day}", getDay());

		// pick a prompt from prompts.json
		var promptsCount = prompts.length;
		index = Math.floor(Math.random() * promptsCount);
		var prompt = prompts[index];
		
		// Build the message content
		var messageContent = new Array();
		messageContent.push("\n");
		messageContent.push("*" + intro + "*");
		messageContent.push("\n\n");
		messageContent.push("*Here is your prompt:*\n");
		messageContent.push("` " + prompt + " `");

        var actionButtonRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId("btn-trigger-modal")
                    .setStyle(ButtonStyle.Primary)
                    .setLabel("Submit an answer"));
		
        var channel = await interaction.client.channels.fetch(interaction.channelId);
        var msg = await channel.send({ content: MessageWriter.writeLines(messageContent), components: [actionButtonRow] });

        return {
			// keep a reference to the original interaction that started the game
            originalInteraction: interaction,
			// the guild id
            guildId: guildId,
			// the original message object that was sent at the start of the game 
            message: msg,
			// a map of responses / the usernames who posted them, etc
            responses: new Map(),
			// a map of users and who they voted for 
			votes: new Map(),
			// the voting message
			votingMessage: null,
			// the prompt
			prompt: prompt,
			// Stores interactions that have been replied to that should be deleted when the game ends
			repliesToDelete: [interaction]
        };
	},
};

// Gets the day of the week as text.  Stolen from https://www.w3schools.com/jsref/jsref_getday.asp 
var getDay = function(dayIndex) {
	const weekday = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

	const d = new Date();
	return weekday[d.getDay()];
}