/*
    KWIPLASH by Jordan Bleu

    A chat based clone / rip-off of Quiplash for discord.
    See readme.md for details.
*/

const { Client, Events, GatewayIntentBits, Collection, ModalBuilder, TextInputBuilder,TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, Message } = require('discord.js');
const { token } = require('./config.json');
const client = new Client({ intents: [GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions] });
const { MessageWriter } = require("./util/MessageWriter.js");
const finalComments = require("./finalComments.json");
const finalCommentsTie = require("./finalComments_tie.json");

const fs = require('node:fs');
const path = require('node:path');

client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// How long to collect responses for
const LOBBY_WAIT_TIME = 45000;
const VOTING_WAIT_TIME = 15000;

let sessionMap = new Map();

// Populates our list of slash commands based on files in the commands folder 
for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = require(filePath);
	// Set a new item in the Collection with the key as the command name and the value as the exported module
	if ('data' in command && 'execute' in command) {
		client.commands.set(command.data.name, command);
	} else {
		console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

client.on(Events.InteractionCreate, async interaction => {

    // if somebody is requested a new game 
    if (interaction.isChatInputCommand()) 
    { 
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            // Currently the only slash command we have starts a new game
            if (sessionMap.has(interaction.guildId)) {
                interaction.reply({content: "Looks like there's already an active game of Kwiplash going! :)", ephemeral: true});
                return;
            }

            var gameData = await command.execute(interaction);
            sessionMap.set(gameData.guildId, gameData);

            await sleep(LOBBY_WAIT_TIME);
            await displayResponsesAndCollectVotes(gameData);

        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Oh god, something went wrong with the bot :(', ephemeral: true });
        }
    } 
    // if somebody has pressed the 'submit an answer' button, show the modal window
    else if (interaction.isButton()) 
    {
        if (!sessionMap.has(interaction.guildId)) {
            interaction.reply({content: "It doesn't look like there's a game of Kwiplash running anymore.  You can start one with /kwiplash ;)", ephemeral: true});
            return;
        }

        if (interaction.customId==="btn-trigger-modal")
        {
            var guildId = interaction.guildId;
            var gameData = sessionMap.get(guildId);    

            var truncatedLabel = gameData.prompt;

            if (truncatedLabel.length > 30) 
            {
                truncatedLabel = truncatedLabel.substring(0,27) + "..."
            }

            const modal = new ModalBuilder()
            .setCustomId('submit-modal')
            .setTitle("Submit a Kwiplash response!")
            .addComponents([
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('submit-modal-input')
                        .setLabel(truncatedLabel)
                        .setStyle(TextInputStyle.Short)
                        .setMinLength(2)
                        .setMaxLength(45)
                        .setPlaceholder("something super hilarious...")
                        .setRequired(true),
                ),
            ]);
            await interaction.showModal(modal);
            return;
        }

        // User is are voting on a response
        var responseUsername = interaction.customId.split(":")[1];

        var guildId = interaction.guildId;
        var gameData = sessionMap.get(guildId);    
        var userName = interaction.user.username;

        if (userName === responseUsername) {
            await interaction.reply({content: "You can't vote for your own response, nice try 😡", ephemeral: true});
            return;
        }

        if (!gameData.votes.has(userName))
        {
            await interaction.reply(`${userName} has voted!`);
        } 
        else 
        {
            await interaction.reply(`${userName} has updated their vote!`);
        }
        
        gameData.votes.set(userName, responseUsername);
        sessionMap.get(guildId).repliesToDelete.push(interaction);
    }  
    else if (interaction.isModalSubmit())
    {
        var guildId = interaction.guildId;

        if (!sessionMap.has(guildId)) {
            interaction.reply({content: "It doesn't look like there's a game of Kwiplash running.  You can start one with /kwiplash :)", ephemeral: true});
        }

        if (sessionMap.get(guildId).responses.length > 7) {
            interaction.reply({content: "Looks like there's already too many people in this game.  Hopefully you'll get to join the next one.", ephemeral: true});
        }
  
        var username = interaction.user.username;
        var response = interaction.fields.getTextInputValue("submit-modal-input");

        // responses map is keyed on username
        var isEdited = sessionMap.get(guildId).responses.has(username);

        sessionMap.get(guildId).responses.set(username, {
            username: username,
            responseText: response,
        });

        if (isEdited) {
            interaction.reply(`***${username}** has edited their response!*`);
        } 
        else {
            interaction.reply(`***${username}** has submitted a response!*`);
        }

        sessionMap.get(guildId).repliesToDelete.push(interaction);
    }
});

sleep = async (ms) => await new Promise(r => setTimeout(r,ms));

/**
 * sends the voting message and waits on votes
*/
displayResponsesAndCollectVotes = async function(gameDataObject)
{
    // delete the prompt message
    await gameDataObject.message.delete().catch(err=>console.log("there was an error deleting the original message, it may have already been deleted."));
    
    var interaction = gameDataObject.originalInteraction;
    var channel = await interaction.client.channels.fetch(interaction.channelId);    

    // if nobody submitted responses, end the game early.
    if (gameDataObject.responses == null || gameDataObject.responses.size == 0) {

        var lines = new Array();
        lines.push("Nobody submitted any response to the prompt.  Game over I guess, nobody wins. 😢");

        await channel.send(MessageWriter.writeLines(lines));
        await endGame(gameDataObject);
        return;
    }

    var votingMessageContent = writeVotingMessage(gameDataObject);

    var msg = await channel.send(votingMessageContent);

    sessionMap.get(gameDataObject.guildId).votingMessage = msg;

    await sleep(VOTING_WAIT_TIME);

    await displayFinalResults(gameDataObject);
} 

// Writes out the content for the voting message minus voting results 
writeVotingMessage = function(gameDataObject) {
    
    let buttons = new Set();
    var promptsText = "";

    var ind = 0;
    gameDataObject.responses.forEach((resp, index) => {

        var displayId = ind + 1;

        var respUsername = resp.username;
        var emoji = getEmojiForId(displayId);

        buttons.add(new ButtonBuilder()
            .setCustomId("btn-vote:" + respUsername)
            .setLabel("Vote")
            .setEmoji(emoji)
            .setStyle(ButtonStyle.Secondary)
        );

        promptsText = promptsText
            .concat("\n\n")
            .concat(emoji + " : ")
            .concat(resp.responseText)
            .concat("\n");
        ind++; 
            
    });

    var actionButtonRow = new ActionRowBuilder()
        .addComponents(Array.from(buttons));

    var votingMessageContent = "Time to vote!  Click the emoji buttons below to vote for the corresponding response!"
        .concat(promptsText);

    return { content: votingMessageContent, components: [actionButtonRow] };
}

displayFinalResults = async function(gameDataObject)
{
    var votes = gameDataObject.votes;
    var interaction = gameDataObject.originalInteraction;
    var channel = await interaction.client.channels.fetch(interaction.channelId);    

    // delete the voting message
    gameDataObject.votingMessage.delete().catch(err=>console.log("there was an error deleting the voting message, it may have already been deleted."));;

    if (votes.size == 0) {
        var lines = ["Oh...nobody voted.  Well, I guess nobody wins then."];
        await channel.send({ content:  MessageWriter.writeLines(lines) });
        await endGame(gameDataObject);
        return;
    }


    // counts is a map of username / vote count
    var counts = new Map();

    var highestCount = 0;
    
    var votesText = "\n*Here's how you all voted:*";

    // tally votes
    votes.forEach((v,k)=> {

        var responseText = gameDataObject.responses.get(v).responseText;
        votesText = votesText.concat(`\n *-- ${k} voted for '${responseText}'...*`);

        // k is the voter username, v is who they voted for
        if (counts.has(v)) {
            // increment the votes
            counts.set(v, counts.get(v)+1);
        } else {
            // first vote!
            counts.set(v, 1);
        }

        // someday i'll make this not hacky (jk i won't bother)
        var currentVotesForUser = counts.get(v);

        if (currentVotesForUser > highestCount) {
            highestCount = currentVotesForUser;
        }
    });

    var winners = new Array();

    // we have the highest count, find all users who have that same count (so we can detect any ties)
    counts.forEach((v,k)=>{

        // v is the counts, k is the username
        if (v == highestCount) {
            winners.push(k);
        }
    });

    var winnerText = "";
    if (winners.length > 1) {
        winnerText = `*Looks like we have a tie with ${highestCount} vote(s)!*`;
    } else {
        winnerText = `*Looks like we have a winner with ${highestCount} vote(s)!*`;
    }

    var winningPromptText = "";

    winners.forEach(winner => {
        var winningResp = gameDataObject.responses.get(winner).responseText;

        winningPromptText = winningPromptText
            .concat("\n")
            .concat("`" + gameDataObject.prompt + "`")
            .concat("\n")
            .concat("> " + winningResp + "")
            .concat("\n")
            .concat("- " + winner)
            .concat("\n");
    });

    var finalComment = "";
    // if game was a tie
    if (winners.length > 1) {
        var finalCommentCount = finalCommentsTie.length;
        var index = Math.floor(Math.random() * finalCommentCount);
        finalComment = finalCommentsTie[index];
    } else {
        var finalCommentCount = finalComments.length;
        var index = Math.floor(Math.random() * finalCommentCount);
        finalComment = finalComments[index];
        finalComment = finalComment.replace("{username}", winners[0]);
    }

    // build the final message
    var lines = new Array();
    lines.push("\n" + winnerText + "\n");
    lines.push("\n =-=-=-=-=-=-=-=-=-=-=-=-=-=-=");
    lines.push(winningPromptText);
    lines.push("=-=-=-=-=-=-=-=-=-=-=-=-=-=-=");
    lines.push("\n\n*" + finalComment + "*\n");
    lines.push(votesText);
    lines.push("\n\n*Thanks for playing!*");

    await channel.send({ content: MessageWriter.writeLines(lines) });
    
    await endGame(gameDataObject);
}

getEmojiForId = function(displayId)
{
    switch(displayId)
    {
        case 1:
            return '💩';
        case 2: 
            return '🍕';
        case 3:
            return '🥸';
        case 4:
            return '🍆';
        case 5:
            return '👺';
        case 6:
            return '🦀';
        case 7: 
            return '🔥';
        case 8:
            return '⛄️';
        default:
            return "";
    }
}

endGame = async function(gameDataObject) {

    gameDataObject.repliesToDelete.forEach(interaction=>{
        interaction.deleteReply().catch(err=>console.log("there was an error deleting a reply, it may have already been deleted."));;
    });

    sessionMap.delete(gameDataObject.guildId);
}


// Log in to Discord with your client's token
client.login(token);
