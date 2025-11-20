import "dotenv/config"; // Load .env
import {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActivityType,
} from "discord.js";
import fetch from "node-fetch";
import sqlite3 from "sqlite3";
import fs from "fs";
import http from "http"; // Add this import for dummy server

const db = new sqlite3.Database("roblox.db");
db.run(`CREATE TABLE IF NOT EXISTS accounts(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    password TEXT,
    used INTEGER DEFAULT 0
)`);
db.run(`CREATE TABLE IF NOT EXISTS unchecked_accounts(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    password TEXT,
    used INTEGER DEFAULT 0
)`);
db.run(`CREATE TABLE IF NOT EXISTS users(
    user_id TEXT PRIMARY KEY,
    credits INTEGER DEFAULT 0,
    last_gen INTEGER DEFAULT 0,
    last_gamble INTEGER DEFAULT 0,
    last_daily INTEGER DEFAULT 0
)`);
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
});
const OWNER_ID = "1296553994407247893"; // Change to your Discord ID
const COOLDOWN_GEN = 3600; // 1 hour in seconds
const COOLDOWN_GAMBLE = 30; // 30 seconds cooldown
const COOLDOWN_DAILY = 86400; // 24 hours in seconds
// Whitelist and Bans JSON files
const WHITELIST_FILE = "whitelist.json";
const BANS_FILE = "bans.json";
if (!fs.existsSync(WHITELIST_FILE))
    fs.writeFileSync(WHITELIST_FILE, JSON.stringify([]));
if (!fs.existsSync(BANS_FILE)) fs.writeFileSync(BANS_FILE, JSON.stringify([]));
function getWhitelist() {
    return JSON.parse(fs.readFileSync(WHITELIST_FILE, "utf8"));
}
function saveWhitelist(whitelist) {
    fs.writeFileSync(WHITELIST_FILE, JSON.stringify(whitelist));
}
function getBans() {
    return JSON.parse(fs.readFileSync(BANS_FILE, "utf8"));
}
function saveBans(bans) {
    fs.writeFileSync(BANS_FILE, JSON.stringify(bans));
}
// Ensure user exists in DB
function ensureUser(userId, cb) {
    db.run(`INSERT OR IGNORE INTO users(user_id) VALUES(?)`, [userId], cb);
}
// Delay function for animations
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// Generate short username/password
function generateShortUP() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const rand = (len) =>
        Array.from(
            { length: len },
            () => chars[Math.floor(Math.random() * chars.length)],
        ).join("");
    return {
        username: rand(6), // short random username with letters and numbers
        password: rand(8) + "A1!", // short random password with letters and numbers, plus fixed suffix for complexity
    };
}
// Rotating statuses array
const statuses = [
    { name: "DonutThugs GAY", type: ActivityType.Custom },
    { name: "Free robux hack no scam mango", type: ActivityType.Playing },
    {
        name: "Stock: {checked} | Unchecked: {unchecked}",
        type: ActivityType.Watching,
    },
    { name: "Skidding", type: ActivityType.Competing },
    { name: "!gen", type: ActivityType.Listening },
    { name: "ayo thats sussy", type: ActivityType.Playing },
    {
        name: "https://discord.gg/S7xGRrKP79",
        type: ActivityType.Streaming,
        url: "https://www.twitch.tv/midfrr101010",
    },
];
let currentIndex = 0;
let startTime; // For uptime
async function updateStatus() {
    const activity = statuses[currentIndex];
    let name = activity.name;
    // Dynamic stock counter for specific status
    if (name.includes("{checked}") || name.includes("{unchecked}")) {
        const checked = await new Promise((res) =>
            db.get(
                `SELECT COUNT(*) as c FROM accounts WHERE used = 0`,
                (_, r) => res(r?.c || 0),
            ),
        );
        const unchecked = await new Promise((res) =>
            db.get(
                `SELECT COUNT(*) as c FROM unchecked_accounts WHERE used = 0`,
                (_, r) => res(r?.c || 0),
            ),
        );
        name = name
            .replace("{checked}", checked)
            .replace("{unchecked}", unchecked);
    }
    client.user.setPresence({
        activities: [
            { name, type: activity.type, url: activity.url || undefined },
        ],
        status: "dnd",
    });
    currentIndex = (currentIndex + 1) % statuses.length;
}
client.once("ready", () => {
    console.log(`Bot ready: ${client.user.tag}`);
    startTime = Date.now(); // Track start time for uptime
    updateStatus(); // Set initial status
    setInterval(updateStatus, 12000); // Rotate every 12 seconds
});
client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
    const embed = (title, desc) =>
        new EmbedBuilder()
            .setColor(0x000000)
            .setTitle(title)
            .setDescription(desc);
    // !whitelist user_id (owner only)
    if (msg.content.startsWith("!whitelist") && msg.author.id === OWNER_ID) {
        const args = msg.content.slice(11).trim();
        if (!args)
            return msg.reply({
                embeds: [embed("Error", "Use: !whitelist user_id")],
            });
        let whitelist = getWhitelist();
        if (!whitelist.includes(args)) {
            whitelist.push(args);
            saveWhitelist(whitelist);
            msg.reply({ embeds: [embed("Success", "User whitelisted!")] });
        } else {
            msg.reply({ embeds: [embed("Error", "User already whitelisted")] });
        }
    }
    // !unwhite user_id (owner only)
    if (msg.content.startsWith("!unwhite") && msg.author.id === OWNER_ID) {
        const args = msg.content.slice(9).trim();
        if (!args)
            return msg.reply({
                embeds: [embed("Error", "Use: !unwhite user_id")],
            });
        let whitelist = getWhitelist();
        whitelist = whitelist.filter((id) => id !== args);
        saveWhitelist(whitelist);
        msg.reply({ embeds: [embed("Success", "User unwhitelisted!")] });
    }
    // !listwhitelist (owner only)
    if (msg.content === "!listwhitelist" && msg.author.id === OWNER_ID) {
        const whitelist = getWhitelist();
        if (!whitelist.length)
            return msg.reply({
                embeds: [embed("Whitelist", "No whitelisted users")],
            });
        const list = whitelist.join("\n");
        msg.reply({ embeds: [embed("Whitelisted Users", list)] });
    }
    // !genBan user_id (owner only)
    if (msg.content.startsWith("!genBan") && msg.author.id === OWNER_ID) {
        const args = msg.content.slice(8).trim();
        if (!args)
            return msg.reply({
                embeds: [embed("Error", "Use: !genBan user_id")],
            });
        let bans = getBans();
        if (!bans.includes(args)) {
            bans.push(args);
            saveBans(bans);
            msg.reply({ embeds: [embed("Success", "User banned from !gen")] });
        } else {
            msg.reply({ embeds: [embed("Error", "User already banned")] });
        }
    }
    // !genunban user_id (owner only)
    if (msg.content.startsWith("!genunban") && msg.author.id === OWNER_ID) {
        const args = msg.content.slice(10).trim();
        if (!args)
            return msg.reply({
                embeds: [embed("Error", "Use: !genunban user_id")],
            });
        let bans = getBans();
        bans = bans.filter((id) => id !== args);
        saveBans(bans);
        msg.reply({ embeds: [embed("Success", "User unbanned from !gen")] });
    }
    // !give @user <amount> (Gen Managers only)
    if (msg.content.startsWith("!give")) {
        const whitelist = getWhitelist();
        if (!whitelist.includes(msg.author.id) && msg.author.id !== OWNER_ID) {
            return msg.reply({
                embeds: [embed("Error", "You are not authorized (Gen Managers only)")],
            });
        }
        const mentionedUser = msg.mentions.users.first();
        if (!mentionedUser) {
            return msg.reply({
                embeds: [embed("Error", "Use: !give @user <amount>")],
            });
        }
        const args = msg.content.slice(6).trim().split(/\s+/);
        if (args.length < 2) {
            return msg.reply({
                embeds: [embed("Error", "Use: !give @user <amount>")],
            });
        }
        const amountStr = args.pop();
        const amount = parseInt(amountStr);
        if (isNaN(amount) || amount <= 0) {
            return msg.reply({
                embeds: [embed("Error", "Amount must be a positive number")],
            });
        }
        ensureUser(mentionedUser.id, () => {
            db.run(
                `UPDATE users SET credits = credits + ? WHERE user_id = ?`,
                [amount, mentionedUser.id],
                (err) => {
                    if (err) {
                        return msg.reply({
                            embeds: [embed("Error", "Error giving credits")],
                        });
                    }
                    msg.reply({
                        embeds: [
                            embed(
                                "Success",
                                `Gave ${amount} credits to ${mentionedUser.tag}`,
                            ),
                        ],
                    });
                },
            );
        });
    }
    // !remove @user (Gen Managers only)
    if (msg.content.startsWith("!remove")) {
        const whitelist = getWhitelist();
        if (!whitelist.includes(msg.author.id) && msg.author.id !== OWNER_ID) {
            return msg.reply({
                embeds: [embed("Error", "You are not authorized (Gen Managers only)")],
            });
        }
        const mentionedUser = msg.mentions.users.first();
        if (!mentionedUser) {
            return msg.reply({
                embeds: [embed("Error", "Use: !remove @user")],
            });
        }
        ensureUser(mentionedUser.id, () => {
            db.run(
                `UPDATE users SET credits = 0 WHERE user_id = ?`,
                [mentionedUser.id],
                (err) => {
                    if (err) {
                        return msg.reply({
                            embeds: [embed("Error", "Error removing credits")],
                        });
                    }
                    msg.reply({
                        embeds: [
                            embed(
                                "Success",
                                `Removed all credits from ${mentionedUser.tag}`,
                            ),
                        ],
                    });
                },
            );
        });
    }
    // !resetdata (Gen Managers only)
    if (msg.content === "!resetdata") {
        const whitelist = getWhitelist();
        if (!whitelist.includes(msg.author.id) && msg.author.id !== OWNER_ID) {
            return msg.reply({
                embeds: [embed("Error", "You are not authorized (Gen Managers only)")],
            });
        }
        db.run(`UPDATE users SET credits = 0`, (err) => {
            if (err) {
                return msg.reply({
                    embeds: [embed("Error", "Error resetting credit data")],
                });
            }
            msg.reply({
                embeds: [
                    embed(
                        "Success",
                        "Reset all user credit data",
                    ),
                ],
            });
        });
    }
    // !creds or !credits
    if (msg.content === "!creds" || msg.content === "!credits") {
        ensureUser(msg.author.id, () => {
            db.get(
                `SELECT credits FROM users WHERE user_id = ?`,
                [msg.author.id],
                (err, row) => {
                    if (err) {
                        return msg.reply({
                            embeds: [embed("Error", "Database error")],
                        });
                    }
                    msg.reply({
                        embeds: [
                            embed(
                                "Your Credits",
                                `You have ${row.credits} credits.`,
                            ),
                        ],
                    });
                },
            );
        });
    }
    // !gamble
    if (msg.content === "!gamble") {
        ensureUser(msg.author.id, () => {
            db.get(
                `SELECT last_gamble FROM users WHERE user_id = ?`,
                [msg.author.id],
                async (err, user) => {
                    if (err) {
                        return msg.reply({
                            embeds: [embed("Error", "Database error")],
                        });
                    }
                    const now = Math.floor(Date.now() / 1000);
                    const timeSince = now - (user?.last_gamble || 0);
                    if (timeSince < COOLDOWN_GAMBLE) {
                        const remaining = COOLDOWN_GAMBLE - timeSince;
                        return msg.reply({
                            embeds: [
                                embed(
                                    "Cooldown",
                                    `Please wait ${remaining} seconds before gambling again.`,
                                ),
                            ],
                        });
                    }
                    // Update last_gamble
                    db.run(
                        `UPDATE users SET last_gamble = ? WHERE user_id = ?`,
                        [now, msg.author.id],
                        async (updateErr) => {
                            if (updateErr) {
                                return msg.reply({
                                    embeds: [
                                        embed("Error", "Database update error"),
                                    ],
                                });
                            }
                            // Animation
                            const statusEmbed = embed("Gamble", "Rolling the dice...");
                            const statusMsg = await msg.reply({
                                embeds: [statusEmbed],
                            });
                            await delay(500);
                            statusEmbed.setDescription("Rolling the dice..");
                            await statusMsg.edit({ embeds: [statusEmbed] });
                            await delay(500);
                            statusEmbed.setDescription("Rolling the dice...");
                            await statusMsg.edit({ embeds: [statusEmbed] });
                            await delay(500);
                            statusEmbed.setDescription("Spinning...");
                            await statusMsg.edit({ embeds: [statusEmbed] });
                            await delay(500);
                            statusEmbed.setDescription("Spinning..");
                            await statusMsg.edit({ embeds: [statusEmbed] });
                            await delay(500);
                            statusEmbed.setDescription("Spinning...");
                            await statusMsg.edit({ embeds: [statusEmbed] });
                            await delay(500);
                            const chance = Math.random();
                            if (chance < 0.1) {
                                db.run(
                                    `UPDATE users SET credits = credits + 1 WHERE user_id = ?`,
                                    [msg.author.id],
                                    (err) => {
                                        if (err) console.error(err);
                                    },
                                );
                                statusEmbed.setDescription("🎉 You won! +1 credit added.");
                            } else {
                                statusEmbed.setDescription("😞 You lost. Better luck next time!");
                            }
                            await statusMsg.edit({ embeds: [statusEmbed] });
                        },
                    );
                },
            );
        });
    }
    // !daily
    if (msg.content === "!daily") {
        ensureUser(msg.author.id, () => {
            db.get(
                `SELECT last_daily FROM users WHERE user_id = ?`,
                [msg.author.id],
                async (err, user) => {
                    if (err) {
                        return msg.reply({
                            embeds: [embed("Error", "Database error")],
                        });
                    }
                    const now = Math.floor(Date.now() / 1000);
                    const timeSince = now - (user?.last_daily || 0);
                    if (timeSince < COOLDOWN_DAILY) {
                        const remaining = COOLDOWN_DAILY - timeSince;
                        return msg.reply({
                            embeds: [
                                embed(
                                    "Cooldown",
                                    `Please wait ${Math.ceil(remaining / 3600)} hours before claiming daily again.`,
                                ),
                            ],
                        });
                    }
                    // Update last_daily and add 1 credit
                    db.run(
                        `UPDATE users SET last_daily = ?, credits = credits + 1 WHERE user_id = ?`,
                        [now, msg.author.id],
                        async (updateErr) => {
                            if (updateErr) {
                                return msg.reply({
                                    embeds: [
                                        embed("Error", "Database update error"),
                                    ],
                                });
                            }
                            const statusEmbed = embed("Daily Reward", "Claiming your daily credit...");
                            const statusMsg = await msg.reply({
                                embeds: [statusEmbed],
                            });
                            await delay(500);
                            statusEmbed.setDescription("Claiming your daily credit..");
                            await statusMsg.edit({ embeds: [statusEmbed] });
                            await delay(500);
                            statusEmbed.setDescription("Claiming your daily credit...");
                            await statusMsg.edit({ embeds: [statusEmbed] });
                            await delay(500);
                            statusEmbed.setDescription("🎉 Claimed! +1 credit added.");
                            await statusMsg.edit({ embeds: [statusEmbed] });
                        },
                    );
                },
            );
        });
    }
    // !restock username:password (allowed users only) - adds to normal stock (accounts table)
    if (msg.content.startsWith("!restock")) {
        const whitelist = getWhitelist();
        if (!whitelist.includes(msg.author.id) && msg.author.id !== OWNER_ID) {
            return msg.reply({
                embeds: [embed("Error", "You cannot restock")],
            });
        }
        const args = msg.content.slice(9).trim();
        if (!args.includes(":")) {
            return msg.reply({
                embeds: [embed("Error", "Use: !restock username:password")],
            });
        }
        const [username, password] = args.split(":");
        if (!username || !password) {
            return msg.reply({ embeds: [embed("Error", "Bad format")] });
        }
        db.run(
            `INSERT INTO accounts(username, password) VALUES(?, ?)`,
            [username.trim(), password.trim()],
            (err) => {
                if (err)
                    return msg.reply({
                        embeds: [embed("Error", "Error adding")],
                    });
                msg.author.send(
                    `Added to normal stock:\nUsername: ${username}\nPassword: ${password}`,
                );
                msg.reply({
                    embeds: [embed("Success", "Added to normal stock")],
                });
            },
        );
    }
    // !uncheckedrestock username:password (allowed users only) - adds to unchecked stock (unchecked_accounts table)
    if (msg.content.startsWith("!uncheckedrestock")) {
        const whitelist = getWhitelist();
        if (!whitelist.includes(msg.author.id) && msg.author.id !== OWNER_ID) {
            return msg.reply({
                embeds: [embed("Error", "You cannot uncheckedrestock")],
            });
        }
        const args = msg.content.slice(18).trim();
        if (!args.includes(":")) {
            return msg.reply({
                embeds: [
                    embed("Error", "Use: !uncheckedrestock username:password"),
                ],
            });
        }
        const [username, password] = args.split(":");
        if (!username || !password) {
            return msg.reply({ embeds: [embed("Error", "Bad format")] });
        }
        db.run(
            `INSERT INTO unchecked_accounts(username, password) VALUES(?, ?)`,
            [username.trim(), password.trim()],
            (err) => {
                if (err)
                    return msg.reply({
                        embeds: [embed("Error", "Error adding")],
                    });
                msg.author.send(
                    `Added to unchecked stock:\nUsername: ${username}\nPassword: ${password}`,
                );
                msg.reply({
                    embeds: [embed("Success", "Added to unchecked stock")],
                });
            },
        );
    }
    // !createUP (owner only)
    if (msg.content === "!createUP" && msg.author.id === OWNER_ID) {
        const { username, password } = generateShortUP();
        db.run(
            `INSERT INTO unchecked_accounts(username, password) VALUES(?, ?)`,
            [username, password],
            (err) => {
                if (err)
                    return msg.reply({
                        embeds: [embed("Error", "Error adding")],
                    });
                msg.author.send(
                    `Generated to unchecked:\nUsername: ${username}\nPassword: ${password}`,
                );
                msg.reply({
                    embeds: [embed("Success", "Created Username/Password")],
                });
            },
        );
    }
    // !removeall (owner only) - removes all accounts from both stocks
    if (msg.content === "!removeall" && msg.author.id === OWNER_ID) {
        db.run(`DELETE FROM accounts`, (err1) => {
            if (err1) {
                return msg.reply({
                    embeds: [embed("Error", "Error removing from accounts")],
                });
            }
            db.run(`DELETE FROM unchecked_accounts`, (err2) => {
                if (err2) {
                    return msg.reply({
                        embeds: [
                            embed(
                                "Error",
                                "Error removing from unchecked_accounts",
                            ),
                        ],
                    });
                }
                msg.reply({
                    embeds: [
                        embed(
                            "Success",
                            "Removed all accounts from both stocks",
                        ),
                    ],
                });
            });
        });
    }
    // !removeacc <number> (owner only) - removes <number> accounts from both stocks
    if (msg.content.startsWith("!removeacc") && msg.author.id === OWNER_ID) {
        const args = msg.content.slice(11).trim();
        const number = parseInt(args);
        if (isNaN(number) || number <= 0) {
            return msg.reply({
                embeds: [
                    embed(
                        "Error",
                        "Use: !removeacc <number> (positive integer)",
                    ),
                ],
            });
        }
        db.run(`DELETE FROM accounts LIMIT ?`, [number], (err1) => {
            if (err1) {
                return msg.reply({
                    embeds: [embed("Error", "Error removing from accounts")],
                });
            }
            db.run(
                `DELETE FROM unchecked_accounts LIMIT ?`,
                [number],
                (err2) => {
                    if (err2) {
                        return msg.reply({
                            embeds: [
                                embed(
                                    "Error",
                                    "Error removing from unchecked_accounts",
                                ),
                            ],
                        });
                    }
                    msg.reply({
                        embeds: [
                            embed(
                                "Success",
                                `Removed ${number} accounts from both stocks`,
                            ),
                        ],
                    });
                },
            );
        });
    }
    // !gen (checked)
    if (msg.content === "!gen") {
        const bans = getBans();
        if (bans.includes(msg.author.id))
            return msg.reply({
                embeds: [embed("Error", "You are banned from !gen")],
            });
        ensureUser(msg.author.id, () => {
            db.get(
                `SELECT credits, last_gen FROM users WHERE user_id = ?`,
                [msg.author.id],
                async (err, user) => {
                    if (err) {
                        return msg.reply({
                            embeds: [embed("Error", "Database error")],
                        });
                    }
                    const now = Math.floor(Date.now() / 1000);
                    const timeSince = now - user.last_gen;
                    if (timeSince < COOLDOWN_GEN) {
                        const remaining = COOLDOWN_GEN - timeSince;
                        return msg.reply({
                            embeds: [
                                embed(
                                    "Cooldown",
                                    `Please wait ${Math.ceil(
                                        remaining / 60,
                                    )} minutes before generating again.`,
                                ),
                            ],
                        });
                    }
                    if (user.credits < 1) {
                        return msg.reply({
                            embeds: [
                                embed(
                                    "Insufficient Credits",
                                    "You need at least 1 credit to generate an account. Use !gamble or !daily to earn more.",
                                ),
                            ],
                        });
                    }
                    // Deduct credit and update last_gen
                    db.run(
                        `UPDATE users SET credits = credits - 1, last_gen = ? WHERE user_id = ?`,
                        [now, msg.author.id],
                        async (updateErr) => {
                            if (updateErr) {
                                return msg.reply({
                                    embeds: [
                                        embed("Error", "Database update error"),
                                    ],
                                });
                            }
                            // Proceed with generation
                            const statusEmbed = embed("Status", "Searching...");
                            const statusMsg = await msg.reply({
                                embeds: [statusEmbed],
                            });
                            await delay(500);
                            statusEmbed.setDescription("Searching..");
                            await statusMsg.edit({ embeds: [statusEmbed] });
                            await delay(500);
                            statusEmbed.setDescription("Searching...");
                            await statusMsg.edit({ embeds: [statusEmbed] });
                            await delay(500);
                            db.get(
                                `SELECT * FROM accounts WHERE used = 0 LIMIT 1`,
                                async (getErr, row) => {
                                    if (getErr) {
                                        statusEmbed.setDescription("Error");
                                        return statusMsg.edit({
                                            embeds: [statusEmbed],
                                        });
                                    }
                                    if (!row) {
                                        statusEmbed.setDescription(
                                            "No accounts",
                                        );
                                        return statusMsg.edit({
                                            embeds: [statusEmbed],
                                        });
                                    }
                                    statusEmbed.setDescription(
                                        "ACCOUNT FOUND 🔒 Checking account...",
                                    );
                                    await statusMsg.edit({
                                        embeds: [statusEmbed],
                                    });
                                    await delay(500);
                                    statusEmbed.setDescription(
                                        "ACCOUNT FOUND 🔒 Checking account..",
                                    );
                                    await statusMsg.edit({
                                        embeds: [statusEmbed],
                                    });
                                    await delay(500);
                                    statusEmbed.setDescription(
                                        "ACCOUNT FOUND 🔒 Checking account...",
                                    );
                                    await statusMsg.edit({
                                        embeds: [statusEmbed],
                                    });
                                    await delay(500);
                                    statusEmbed.setDescription(
                                        "🔓 Account found 👀 Checking login...",
                                    );
                                    await statusMsg.edit({
                                        embeds: [statusEmbed],
                                    });
                                    await delay(500);
                                    statusEmbed.setDescription(
                                        "🔓 Account found 👀 Checking login..",
                                    );
                                    await statusMsg.edit({
                                        embeds: [statusEmbed],
                                    });
                                    await delay(500);
                                    statusEmbed.setDescription(
                                        "🔓 Account found 👀 Checking login...",
                                    );
                                    await statusMsg.edit({
                                        embeds: [statusEmbed],
                                    });
                                    await delay(500);
                                    statusEmbed.setDescription("🟢 DONE.");
                                    await statusMsg.edit({
                                        embeds: [statusEmbed],
                                    });
                                    msg.author.send(
                                        `Account:\nUsername: ${row.username}\nPassword: ${row.password}`,
                                    );
                                    await delay(1000);
                                    statusEmbed.setDescription("Check DMs!");
                                    await statusMsg.edit({
                                        embeds: [statusEmbed],
                                    });
                                    db.run(
                                        `DELETE FROM accounts WHERE id = ?`,
                                        [row.id],
                                    );
                                },
                            );
                        },
                    );
                },
            );
        });
    }
    // !uncheckgen
    if (msg.content === "!uncheckgen") {
        const bans = getBans();
        if (bans.includes(msg.author.id))
            return msg.reply({
                embeds: [embed("Error", "You are banned from !uncheckgen")],
            });
        ensureUser(msg.author.id, () => {
            db.get(
                `SELECT credits, last_gen FROM users WHERE user_id = ?`,
                [msg.author.id],
                async (err, user) => {
                    if (err) {
                        return msg.reply({
                            embeds: [embed("Error", "Database error")],
                        });
                    }
                    const now = Math.floor(Date.now() / 1000);
                    const timeSince = now - user.last_gen;
                    if (timeSince < COOLDOWN_GEN) {
                        const remaining = COOLDOWN_GEN - timeSince;
                        return msg.reply({
                            embeds: [
                                embed(
                                    "Cooldown",
                                    `Please wait ${Math.ceil(
                                        remaining / 60,
                                    )} minutes before generating again.`,
                                ),
                            ],
                        });
                    }
                    if (user.credits < 1) {
                        return msg.reply({
                            embeds: [
                                embed(
                                    "Insufficient Credits",
                                    "You need at least 1 credit to generate an account. Use !gamble or !daily to earn more.",
                                ),
                            ],
                        });
                    }
                    // Deduct credit and update last_gen
                    db.run(
                        `UPDATE users SET credits = credits - 1, last_gen = ? WHERE user_id = ?`,
                        [now, msg.author.id],
                        async (updateErr) => {
                            if (updateErr) {
                                return msg.reply({
                                    embeds: [
                                        embed("Error", "Database update error"),
                                    ],
                                });
                            }
                            // Proceed with generation
                            const statusEmbed = embed(
                                "Status",
                                "Searching unchecked...",
                            );
                            const statusMsg = await msg.reply({
                                embeds: [statusEmbed],
                            });
                            await delay(500);
                            statusEmbed.setDescription("Searching unchecked..");
                            await statusMsg.edit({ embeds: [statusEmbed] });
                            await delay(500);
                            statusEmbed.setDescription(
                                "Searching unchecked...",
                            );
                            await statusMsg.edit({ embeds: [statusEmbed] });
                            await delay(500);
                            db.get(
                                `SELECT * FROM unchecked_accounts WHERE used = 0 LIMIT 1`,
                                async (getErr, row) => {
                                    if (getErr) {
                                        statusEmbed.setDescription("Error");
                                        return statusMsg.edit({
                                            embeds: [statusEmbed],
                                        });
                                    }
                                    if (!row) {
                                        statusEmbed.setDescription(
                                            "No unchecked accounts",
                                        );
                                        return statusMsg.edit({
                                            embeds: [statusEmbed],
                                        });
                                    }
                                    statusEmbed.setDescription(
                                        "ACCOUNT FOUND 🔒 Sending unchecked account...",
                                    );
                                    await statusMsg.edit({
                                        embeds: [statusEmbed],
                                    });
                                    await delay(500);
                                    statusEmbed.setDescription(
                                        "ACCOUNT FOUND 🔒 Sending unchecked account..",
                                    );
                                    await statusMsg.edit({
                                        embeds: [statusEmbed],
                                    });
                                    await delay(500);
                                    statusEmbed.setDescription(
                                        "ACCOUNT FOUND 🔒 Sending unchecked account...",
                                    );
                                    await statusMsg.edit({
                                        embeds: [statusEmbed],
                                    });
                                    await delay(500);
                                    statusEmbed.setDescription(
                                        "🟢 DONE. (Unchecked - might not work)",
                                    );
                                    await statusMsg.edit({
                                        embeds: [statusEmbed],
                                    });
                                    msg.author.send(
                                        `Unchecked Account (might not work):\nUsername: ${row.username}\nPassword: ${row.password}`,
                                    );
                                    await delay(1000);
                                    statusEmbed.setDescription("Check DMs!");
                                    await statusMsg.edit({
                                        embeds: [statusEmbed],
                                    });
                                    db.run(
                                        `DELETE FROM unchecked_accounts WHERE id = ?`,
                                        [row.id],
                                    );
                                },
                            );
                        },
                    );
                },
            );
        });
    }
    // !stock
    if (msg.content === "!stock") {
        db.get(`SELECT COUNT(*) as c FROM accounts WHERE used = 0`, (e, r) => {
            if (e) return msg.reply({ embeds: [embed("Error", "Error")] });
            msg.reply({
                embeds: [embed("Stock", `Checked accounts left: ${r?.c || 0}`)],
            });
        });
    }
    // !uncheckstock
    if (msg.content === "!uncheckstock") {
        db.get(
            `SELECT COUNT(*) as c FROM unchecked_accounts WHERE used = 0`,
            (e, r) => {
                if (e) return msg.reply({ embeds: [embed("Error", "Error")] });
                msg.reply({
                    embeds: [
                        embed(
                            "Unchecked Stock",
                            `Unchecked accounts left: ${r?.c || 0}`,
                        ),
                    ],
                });
            },
        );
    }
    // !robloxlookup username
    if (msg.content.startsWith("!robloxlookup")) {
        const args = msg.content.slice(14).trim();
        if (!args)
            return msg.reply({
                embeds: [embed("Error", "Use: !robloxlookup username")],
            });
        try {
            const idRes = await fetch(
                "https://users.roblox.com/v1/usernames/users",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        usernames: [args],
                        excludeBannedUsers: false,
                    }),
                },
            );
            const idData = await idRes.json();
            if (!idData.data.length)
                return msg.reply({
                    embeds: [embed("Error", "User not found")],
                });
            const userId = idData.data[0].id;
            const detailsRes = await fetch(
                `https://users.roblox.com/v1/users/${userId}`,
            );
            const details = await detailsRes.json();

            // Fetch additional info
            const friendsCountRes = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`);
            const friendsCount = await friendsCountRes.json();

            const followersCountRes = await fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`);
            const followersCount = await followersCountRes.json();

            const followingsCountRes = await fetch(`https://friends.roblox.com/v1/users/${userId}/followings/count`);
            const followingsCount = await followingsCountRes.json();

            const presenceRes = await fetch(
                `https://presence.roblox.com/v1/presence/users`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userIds: [userId] }),
                },
            );
            const presenceData = await presenceRes.json();
            const presence = presenceData.userPresences[0];

            const thumbnailRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`);
            const thumbnailData = await thumbnailRes.json();
            const thumbnailUrl = thumbnailData.data[0].imageUrl;

            let info = `Username: ${details.name}\nDisplay Name: ${details.displayName}\nDescription: ${details.description}\nCreated: ${details.created}\nID: ${userId}\nBanned: ${details.isBanned ? 'Yes' : 'No'}\nVerified Badge: ${details.hasVerifiedBadge ? 'Yes' : 'No'}\nFriends: ${friendsCount.count}\nFollowers: ${followersCount.count}\nFollowing: ${followingsCount.count}\nLast Online: ${presence.lastOnline || 'Unknown'}\nPresence: ${presence.userPresenceType === 0 ? 'Offline' : presence.userPresenceType === 1 ? 'Online' : presence.userPresenceType === 2 ? 'In Game' : 'In Studio'}\nHeadshot: ${thumbnailUrl}`;

            msg.reply({
                embeds: [
                    embed(
                        "Roblox User",
                        info,
                    ),
                ],
            });
        } catch (err) {
            console.error(err);
            msg.reply({ embeds: [embed("Error", "Lookup failed")] });
        }
    }
    // !check
    if (msg.content === "!check") {
        const start = Date.now();
        const statusMsg = await msg.reply({
            embeds: [embed("Status", "Pinging...")],
        });
        const latency = Date.now() - start;
        statusMsg.edit({
            embeds: [embed("Status", `Online🟢 | Latency: ${latency}ms`)],
        });
    }
    // !help
    if (msg.content === "!help") {
        msg.reply({
            embeds: [
                embed(
                    "Commands",
                    `**Account Generation**
- !gen: Get a checked account (costs 1 credit, 1 hour cooldown)
- !uncheckgen: Get an unchecked account (costs 1 credit, 1 hour cooldown)

**Stock Information**
- !stock: Show checked stock
- !uncheckstock: Show unchecked stock

**Credit Management**
- !creds / !credits: Check your current credits
- !gamble: 10% chance to earn 1 credit (30s cooldown)
- !daily: Claim 1 credit every 24 hours

**Restock Commands** (Gen Managers / Whitelisted only)
- !restock username:password: Add to normal stock
- !uncheckedrestock username:password: Add to unchecked stock
- !give @user <amount>: Give credits
- !remove @user: Remove all credits from a user
- !resetdata: Reset all user credit data

**Owner Commands**
- !whitelist user_id: Add to whitelist
- !unwhite user_id: Remove from whitelist
- !listwhitelist: List whitelisted users
- !genBan user_id: Ban from !gen
- !genunban user_id: Unban from !gen
- !createUP: Generate short U/P unchecked
- !removeall: Remove all accounts from both stocks
- !removeacc <number>: Remove <number> accounts from both stocks

**Other Commands**
- !robloxlookup username: Lookup Roblox user
- !check: Check bot status and latency`,
                ),
            ],
        });
    }
});
client.login(process.env.DISCORD_TOKEN);

// Add dummy HTTP server to bind to a port for Render deployment
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Discord bot is running\n');
}).listen(process.env.PORT || 3000);
console.log(`Dummy server listening on port ${process.env.PORT || 3000}`);
