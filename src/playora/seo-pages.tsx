import { AdSenseSlot } from "@/components/adsense-slot";
import "./seo-pages.css";
import "./site.css";
import { canonicalUrl } from "./seo-config";

export type SeoPageId =
  | "privacy-policy"
  | "chess"
  | "tic-tac-toe"
  | "snakes-and-ladders"
  | "online-multiplayer"
  | "how-to-play";

export type GameSeoPageId =
  | "2048"
  | "arrows"
  | "bluff"
  | "callbreak"
  | "carrom"
  | "checkers"
  | "connect-four"
  | "crazyeights"
  | "hearts"
  | "joker-duel"
  | "ludo"
  | "poker"
  | "racer"
  | "rummy"
  | "spades"
  | "sudoku"
  | "teenpatti"
  | "uno"
  | "watersort";

type SeoRoutePageId = SeoPageId | GameSeoPageId;

type SeoPageContent = {
  title: string;
  description: string;
  intro: string;
  playHref?: string;
  sections: { heading: string; paragraphs: string[] }[];
  faqs: { question: string; answer: string }[];
  related: { href: string; label: string }[];
};

function gameGuide(
  name: string,
  summary: string,
  howTo: string,
  tip: string,
  multiplayer: boolean,
): SeoPageContent {
  return {
    title: `Play ${name} Online`,
    description: `${summary} Play ${name} free in your browser on GamesLord.`,
    intro: `${summary} Open ${name} on GamesLord in your browser and follow the game controls to get started.`,
    playHref: "/#games",
    sections: [
      {
        heading: `How to play ${name}`,
        paragraphs: [
          howTo,
          "Choose the game from the GamesLord home page and use the instructions shown in the game to begin. The available controls and setup options are displayed before or during play.",
        ],
      },
      {
        heading: `${name} tips for a better game`,
        paragraphs: [tip],
      },
    ],
    faqs: [
      {
        question: `Can I play ${name} for free?`,
        answer: `Yes. ${name} runs in your browser on GamesLord, with no download or account required.`,
      },
      {
        question: `Can I play ${name} with friends?`,
        answer: multiplayer
          ? "Create an online lobby and invite friends with its link or room code. The lobby shows the player options available for this game."
          : `${name} is a solo game. Browse the GamesLord game list for multiplayer titles you can play with friends.`,
      },
      {
        question: `How do I start ${name}?`,
        answer: `Choose ${name} from the game list and select the available game or player setup. Follow the on-screen instructions to begin.`,
      },
    ],
    related: [],
  };
}

const gamePages: Record<GameSeoPageId, SeoPageContent> = {
  "2048": gameGuide(
    "2048",
    "Slide numbered tiles across a four-by-four board to merge matching values and build the 2048 tile.",
    "Use the directional controls to slide every tile. Matching numbers combine into one larger tile, while each move can add another number to the board.",
    "Plan several moves ahead and keep open spaces available. Combining tiles in a consistent direction can make the board easier to manage.",
    false,
  ),
  arrows: gameGuide(
    "Arrows",
    "Clear a puzzle board by sliding each arrow off in the direction it points while managing blocked paths and limited lives.",
    "Select an arrow to move it off the board in its indicated direction. Other arrows can block its path, so work through the available spaces to clear the puzzle.",
    "Look for arrows with a clear exit first, then use hints when the remaining paths are difficult to see.",
    false,
  ),
  bluff: gameGuide(
    "Bluff",
    "Play cards face down, make a claim, and decide when to challenge an opponent in this multiplayer card game.",
    "Take turns playing cards face down and announcing what you played. Call a bluff when you think a claim is false, and try to empty your hand before the other players.",
    "Pay attention to the cards already played and to how confidently opponents make their claims. A well-timed challenge can change the round.",
    true,
  ),
  callbreak: gameGuide(
    "Call Break",
    "Bid for tricks, follow suit, and use spades as trump in this four-player trick-taking card game.",
    "Estimate how many tricks you can take, make your bid, and play one card per trick while following suit when possible. Spades can win tricks as the trump suit.",
    "Consider your high cards and the spades in your hand before bidding. Track which suits have been played to judge what may still be held.",
    true,
  ),
  carrom: gameGuide(
    "Carrom",
    "Aim and flick a striker to pocket carrom coins in a multiplayer tabletop game.",
    "Set your aim, choose the striker's force, and release to send coins toward the pockets. Follow the selected table mode and its scoring instructions.",
    "Use controlled shots to improve your position instead of relying only on maximum force. Watch how a shot may leave coins for the next turn.",
    true,
  ),
  checkers: gameGuide(
    "Indian Checkers",
    "Move diagonally, choose when to jump opposing pieces, chain captures, and crown kings in this classic board game.",
    "Move pieces diagonally across the board. Captures are optional, but once you begin a jump chain, continue capturing with that piece when another jump is available. Reach the far side to crown a king.",
    "Capturing is not compulsory, so weigh a jump against the position you can create with a regular move.",
    true,
  ),
  "connect-four": gameGuide(
    "Connect Four",
    "Drop colored discs into a grid and connect four in a row horizontally, vertically, or diagonally.",
    "Choose a column to drop a disc. Take turns with your opponent and try to make a line of four while preventing their line from forming first.",
    "Look for threats in more than one direction. A move that creates two possible winning lines can force your opponent to block only one.",
    true,
  ),
  crazyeights: gameGuide(
    "Crazy Eights",
    "Match the discard pile by suit or rank, play wild eights, and race to empty your hand.",
    "Play a card that matches the top discard by suit or rank. An eight can change the active suit; draw when you cannot make a play and follow the game's turn prompts.",
    "Save wild eights for turns when they give you a useful suit or help you get rid of your last cards.",
    true,
  ),
  hearts: gameGuide(
    "Hearts",
    "Avoid penalty cards, pass cards each round, and finish a hand of Hearts with the lowest score.",
    "Play one card into each trick and follow the led suit when possible. Hearts and the Queen of Spades carry penalty points, so try not to take unwanted tricks.",
    "Pay attention to which suits players can no longer follow and decide carefully which cards to pass at the start of a hand.",
    true,
  ),
  "joker-duel": gameGuide(
    "Joker Duel",
    "Build poker hands, collect jokers, multiply chip scores, and compete across a best-of-three match.",
    "Form the strongest poker hands available and use joker effects to increase your score. Keep track of the round objective and choose upgrades that support your scoring plan.",
    "Look for joker effects that work well together and build around the hands you can reliably make.",
    true,
  ),
  ludo: gameGuide(
    "Ludo",
    "Roll the dice, move tokens around the board, and race to bring your pieces safely home.",
    "Roll to enter tokens onto the track, then move them according to each dice result. Reach the home path while watching for chances to send rival tokens back to their yards.",
    "Spread your moves across tokens when it helps you make progress, but keep an eye on nearby opponents who could capture an exposed piece.",
    true,
  ),
  poker: gameGuide(
    "Poker",
    "Play Texas Hold'em, make a hand from private and community cards, and compete through betting rounds.",
    "Use your two private cards and the shared board cards to make the best five-card hand. Decide whether to fold, check, call, or raise during each betting round.",
    "Consider the strength of your hand and the community cards before committing chips. The best decision can depend on both your cards and the action at the table.",
    true,
  ),
  racer: gameGuide(
    "Realtime Racer",
    "Race around a top-down track in real time, steering and accelerating as you compete to finish the laps.",
    "Use the driving controls to steer around the course and manage acceleration. Complete the required laps while keeping your racer on the track.",
    "Look ahead to upcoming turns and ease into corners so you can keep control and build speed on the straights.",
    true,
  ),
  rummy: gameGuide(
    "Rummy",
    "Draw and discard cards to build matching sets and consecutive runs before your opponents go out.",
    "Take a card from the stock or discard pile, arrange your hand into valid sets and runs, and discard one card to end your turn. Use the table options to lay off cards when allowed.",
    "Keep track of useful discards and avoid holding cards that could help an opponent complete a combination.",
    true,
  ),
  spades: gameGuide(
    "Spades",
    "Play Spades with two to four players: bid solo in two- or three-player games, or partner up in four-player games.",
    "Estimate how many tricks you can win and bid before playing one card per trick. In four-player games, combine your bid and tricks with your partner. Follow the led suit when possible; spades can trump cards from other suits.",
    "Plan bids around your high cards and spades, and remember which trump cards have already been played.",
    true,
  ),
  sudoku: gameGuide(
    "Sudoku",
    "Fill a nine-by-nine Sudoku grid so every row, column, and three-by-three box contains the numbers one through nine.",
    "Enter a number in an empty cell without repeating it in that row, column, or box. Use notes to track candidates and the available undo or hint controls when needed.",
    "Start with rows, columns, or boxes that have the fewest empty cells, and eliminate candidates using the same number's positions across intersecting groups.",
    false,
  ),
  teenpatti: gameGuide(
    "Teen Patti",
    "Play a three-card Indian poker game with blind or seen play, betting, and showdowns.",
    "Each player receives three cards. Follow the table prompts to play blind or seen, place bets, and decide whether to continue, pack, or request a show.",
    "Set a limit before betting and compare your three-card hand with the table's hand rankings before choosing to stay in.",
    true,
  ),
  uno: gameGuide(
    "UNO",
    "Match colors and numbers, use action cards, and race to empty your hand in a multiplayer UNO game.",
    "Play a card that matches the discard by color or number, or use a wild card when allowed. Action cards change how the round proceeds; follow the prompts when you have one card left.",
    "Watch the active color and save flexible cards for turns when you need to change the direction of play or get out of a difficult hand.",
    true,
  ),
  watersort: gameGuide(
    "Water Sort",
    "Pour colored liquid between tubes until each tube contains a single color.",
    "Choose a tube to pour from and another to pour into, following the game's rules for matching colors and available space. Complete each level by separating the colors.",
    "Keep at least one tube with free space when possible. That gives you room to move colors while uncovering the layers below.",
    false,
  ),
};

const GAME_SEO_IDS: GameSeoPageId[] = [
  "2048",
  "arrows",
  "bluff",
  "callbreak",
  "carrom",
  "checkers",
  "connect-four",
  "crazyeights",
  "hearts",
  "joker-duel",
  "ludo",
  "poker",
  "racer",
  "rummy",
  "spades",
  "sudoku",
  "teenpatti",
  "uno",
  "watersort",
];

const pages: Record<SeoPageId, SeoPageContent> = {
  "privacy-policy": {
    title: "Privacy Policy",
    description:
      "Learn what information GamesLord handles for browser games, online lobbies, voice and video, and optional advertising.",
    intro:
      "This policy explains the information handled when you use GamesLord, including online multiplayer, device permissions and optional advertising.",
    sections: [
      {
        heading: "Information used to run the site",
        paragraphs: [
          "You can play local games without creating a GamesLord account. If you join an online lobby, the service processes the room code, a temporary player identifier, the display name you provide, and WebRTC connection-signaling messages needed to connect players. Signaling messages are intended to expire after about 60 seconds, and inactive lobby records are intended to expire after about 30 seconds; periodic cleanup can make actual deletion later.",
          "Game moves and chat are exchanged between participants through the online game connection and are not intended to be stored as a game history by GamesLord. Your browser may store the most recent room details locally so you can use the rejoin feature. You can clear this information using your browser's site-data controls.",
        ],
      },
      {
        heading: "Camera, microphone and online connections",
        paragraphs: [
          "Voice and video are optional. The browser asks for permission before GamesLord can access your camera or microphone. Media is sent to other participants over WebRTC; when a direct connection cannot be established, a TURN relay provider may relay the connection. You can deny permission or turn off your camera and microphone in the game controls or browser settings.",
          "Online multiplayer requires exchanging connection information through the site's signaling service. The app uses hosting, database and, when configured, TURN providers to operate these features. Those providers process technical data as needed to provide their services.",
        ],
      },
      {
        heading: "Cookies, advertising and third parties",
        paragraphs: [
          "Advertising is optional and disabled unless the site operator enables it with deployment settings. If Google AdSense is enabled, Google and its partners may use cookies or similar technologies and process device, browser and ad-interaction information to serve, measure and, where permitted, personalize ads.",
          "Before serving ads in regions where consent is required, the operator must configure an applicable Google-certified consent management platform and consent message in AdSense Privacy & messaging, and comply with applicable laws. The site's ad integration is gated on an operator confirmation setting; that setting does not itself create or verify a consent message.",
          "The site and its hosting or service providers may process ordinary technical request data, such as browser and connection details, for delivery, security and troubleshooting. This app does not intentionally use a first-party analytics product.",
        ],
      },
      {
        heading: "Your choices and data requests",
        paragraphs: [
          "You can manage browser permissions, clear local site data, and use Google's ad and privacy settings to manage available advertising choices. Where a consent message is shown, use it to review or change the choices it offers. Your legal rights depend on where you live; contact the operator below to ask about a privacy request.",
        ],
      },
      {
        heading: "Policy changes and contact",
        paragraphs: [
          "This policy may be updated when GamesLord's features, providers or legal requirements change. The site operator is identified below using the public deployment settings. This general information is not legal advice; the operator should review it for the jurisdictions and services in which the site is offered.",
        ],
      },
    ],
    faqs: [],
    related: [],
  },
  chess: {
    title: "Play Chess Online",
    description:
      "Play Chess in your browser on GamesLord. Start a local game against the computer or create an online lobby and invite a friend.",
    playHref: "/?play=chess#games",
    intro:
      "Chess is a two-player strategy game where every move changes the position and the plans available to both sides. GamesLord lets you start a game in your browser, practice locally against the computer, or invite someone to an online lobby.",
    sections: [
      {
        heading: "How a Chess game works",
        paragraphs: [
          "One player controls the white pieces and the other controls the black pieces. White moves first, then both sides take turns moving one piece at a time. Each piece has its own pattern of movement, so learning those patterns is the first step toward planning a safe position.",
          "The goal is checkmate: attack the opposing king in a way that leaves no legal move to escape. Capturing pieces can help, but protecting your king and coordinating your pieces matter just as much.",
        ],
      },
      {
        heading: "Start a game on GamesLord",
        paragraphs: [
          "Choose Chess from the games list. For a solo practice session, select the computer option when it is offered. To play with another person, create an online lobby and share its invitation link or room code. Chess is a two-player game, so the host can set two active seats.",
          "Take a moment to check that the board is ready before making a move. If you are new to Chess, focus on developing pieces, keeping the king safe and avoiding moves that leave a piece undefended.",
        ],
      },
      {
        heading: "Simple ideas for your first games",
        paragraphs: [
          "Use the center of the board, bring out your knights and bishops, and avoid moving the same piece repeatedly without a clear reason. Before each turn, ask what your opponent’s last move attacks and whether your king or another piece is at risk.",
          "A short game against the computer is a useful way to get comfortable with selecting pieces and seeing how the board responds. Playing a friend adds a different challenge: explain your plans afterward and look for one move you would change next time.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can I play Chess by myself?",
        answer:
          "Yes. Choose the local computer option to play one side against the built-in computer opponent on the same device.",
      },
      {
        question: "Can I invite a friend to Chess?",
        answer:
          "Yes. Create an online lobby, share the room code or invite link, then start Chess when your friend has joined.",
      },
      {
        question: "How many people can play one Chess game?",
        answer:
          "Chess has two active players. Other people in the lobby can watch if the host has invited more attendees.",
      },
    ],
    related: [
      { href: "/online-multiplayer", label: "How online multiplayer lobbies work" },
      { href: "/how-to-play", label: "Getting started with GamesLord" },
    ],
  },
  "tic-tac-toe": {
    title: "Play Tic-Tac-Toe Online",
    description:
      "Play Tic-Tac-Toe free in your browser. Practice against the computer on one device or invite a friend to a GamesLord online lobby.",
    playHref: "/?play=ttt#games",
    intro:
      "Tic-Tac-Toe is a quick, two-player game with simple rules and room for clever decisions. Play a local round against the computer or invite a friend online, with no download required.",
    sections: [
      {
        heading: "The rules in a minute",
        paragraphs: [
          "The board has nine squares. Players take turns placing their mark in an empty square: one uses X and the other uses O. The first player to make a line of three marks horizontally, vertically or diagonally wins.",
          "If every square is filled and neither player has a line of three, the round is a draw. Since the board is small, the opening move and the response to the center square can quickly determine which lines are still possible.",
        ],
      },
      {
        heading: "Play locally or invite someone",
        paragraphs: [
          "Select Tic-Tac-Toe from the GamesLord games list. You can choose the local computer option for a one-device game, or create an online lobby and share the room code or invitation link with a friend.",
          "Tic-Tac-Toe uses two active seats. In an online lobby the host starts the round after choosing the game and deciding how many attendees should play; extra attendees can follow along as viewers.",
        ],
      },
      {
        heading: "A few useful tactics",
        paragraphs: [
          "When you can win on your next turn, take the square that completes your line. If your opponent has two marks in a row, block the open square before building a slower plan of your own.",
          "The center can contribute to four possible winning lines, while a corner contributes to three. Look for a fork: a move that creates two different winning threats so your opponent cannot block both at once.",
        ],
      },
    ],
    faqs: [
      {
        question: "Is GamesLord Tic-Tac-Toe free?",
        answer:
          "Yes. You can open the game in a browser and start a local round or an online lobby without downloading a separate game.",
      },
      {
        question: "Can I play Tic-Tac-Toe against the computer?",
        answer:
          "Yes. Pick the local computer option to play against the built-in opponent on your device.",
      },
      {
        question: "Can more than two people join?",
        answer:
          "A round has two active players. The lobby can include additional attendees as viewers, up to its current room limit.",
      },
    ],
    related: [
      { href: "/snakes-and-ladders", label: "Play Snakes & Ladders" },
      { href: "/how-to-play", label: "Getting started with GamesLord" },
    ],
  },
  "snakes-and-ladders": {
    title: "Play Snakes & Ladders Online",
    description:
      "Play Snakes & Ladders in your browser on GamesLord. Roll the die, race up ladders and down snakes, or invite a friend to your lobby.",
    playHref: "/?play=snl#games",
    intro:
      "Snakes & Ladders is a turn-based race where a die roll moves each player along the board. Ladders help you climb and snakes send you back, making every turn a surprise. Start a local game against the computer or invite a friend online.",
    sections: [
      {
        heading: "How to play",
        paragraphs: [
          "Players take turns rolling a die and moving their token forward by the number shown. Landing at the bottom of a ladder moves a token up the board; landing on a snake sends it down. The first player to reach the finish wins.",
          "The game is driven mostly by chance, so new players can join without memorizing complex rules. Keep an eye on the board after each roll to see which ladders and snakes may change the race.",
        ],
      },
      {
        heading: "Choose your way to play",
        paragraphs: [
          "Open Snakes & Ladders from the GamesLord games list. Select local play against the computer for a game on one device, or create an online lobby and invite friends with a room code or a shareable link.",
          "The host can set the number of active players before starting. If more people join than the game needs, the others can watch the match from the lobby. Snakes & Ladders is a casual game that works well for mixed ages and quick game-night rounds.",
        ],
      },
      {
        heading: "Make the most of the race",
        paragraphs: [
          "There is no strategy that can control a die roll, but players can keep the game moving by taking turns promptly and checking the board after every move. A ladder can create a sudden lead; a snake can bring the rest of the group back into contention.",
          "For a shared game night, invite everyone to the same lobby before starting. The host can choose who plays and let the rest of the group watch, so nobody needs to leave just because the game has fewer active seats than guests.",
        ],
      },
    ],
    faqs: [
      {
        question: "Is Snakes & Ladders a strategy game?",
        answer:
          "Movement is determined by die rolls, so luck plays the biggest role. The simple turn structure makes it easy to enjoy with a group.",
      },
      {
        question: "Can I play it on one device?",
        answer:
          "Yes. Choose the local computer option to play against the built-in opponent on the same device.",
      },
      {
        question: "Can friends watch an online game?",
        answer:
          "Yes. The host chooses how many people actively play. Other attendees in the lobby can watch the match.",
      },
    ],
    related: [
      { href: "/tic-tac-toe", label: "Play Tic-Tac-Toe" },
      { href: "/online-multiplayer", label: "Invite friends to an online lobby" },
    ],
  },
  "online-multiplayer": {
    title: "Online Multiplayer Games with Friends",
    description:
      "Create a GamesLord game lobby, share an invite link or room code, choose active players and let friends join online from their browsers.",
    intro:
      "GamesLord makes it easy to bring a group together for browser games. The host creates a lobby first, shares a link or room code, and chooses the game after friends arrive. Attendees who are not playing can watch.",
    sections: [
      {
        heading: "Create a lobby and invite friends",
        paragraphs: [
          "Choose a game and select the online lobby option. Once the room is ready, copy its invitation link or room code and send it to your group. Friends can open the link or enter the code from GamesLord’s join screen.",
          "Wait for attendees to connect before choosing the game setup. The host controls the game selection and the number of active players, so the group can decide who will play and who would rather watch.",
        ],
      },
      {
        heading: "Players and viewers share one room",
        paragraphs: [
          "A game may need fewer active players than the number of people who want to join the call. In that case, the host can assign the available player seats and let the remaining attendees spectate. Spectators stay in the lobby and can follow the same match.",
          "GamesLord currently supports up to eight total attendees in a room. The number of active seats depends on the selected game: Chess and Tic-Tac-Toe use two, while other games may allow more. The host can change the game from the lobby.",
        ],
      },
      {
        heading: "Chat and talk during a game",
        paragraphs: [
          "Text chat is available in the game room. Voice chat is offered when there are attendees watching beyond the active player seats, so a larger group can stay involved while a smaller set plays. Browser permissions may be required before using a microphone or camera.",
          "Online connections depend on your browser, network and the room’s connection setup. If a friend cannot connect, check that both people have a stable connection and that the browser has not blocked the required permissions.",
        ],
      },
    ],
    faqs: [
      {
        question: "How do I invite someone to a GamesLord game?",
        answer:
          "Create an online lobby, then share its invitation link or room code. Your friend can use either one to join.",
      },
      {
        question: "Can the host choose who plays?",
        answer:
          "Yes. The host chooses the game and active player count. Other attendees can watch when the room has more people than the game has seats.",
      },
      {
        question: "How many people can join one lobby?",
        answer:
          "A GamesLord room currently supports up to eight attendees total, including the host. The active player count is set for the selected game.",
      },
    ],
    related: [
      { href: "/how-to-play", label: "Step-by-step GamesLord instructions" },
      { href: "/games/chess", label: "Play Chess with a friend" },
    ],
  },
  "how-to-play": {
    title: "How to Play Online Games",
    description:
      "Learn how to play GamesLord games: challenge the computer, take turns with a friend on one device, or create an online lobby and invite friends.",
    intro:
      "GamesLord is a browser-based game room for quick solo sessions and online game nights. Use this guide to choose a game, start locally or invite friends, and understand how player seats and viewers work.",
    sections: [
      {
        heading: "Start a game on one device",
        paragraphs: [
          "Browse the game cards on the home page and choose a title. Select Play vs computer to take one side while the computer takes its turns automatically after a short pause. For a shared-device match, choose User vs User and pass the device between turns.",
          "Some games are designed for two active sides. In User vs User mode, both people take turns making moves on the same device; in computer mode, one person plays against the built-in opponent. Follow the game-room controls and use the menu to return to the games list.",
        ],
      },
      {
        heading: "Play online with friends",
        paragraphs: [
          "Choose the online lobby option to create a room. Copy the room code or invitation link and send it to the people you want to play with. Friends can open the link directly or choose Join a game and enter the code.",
          "After attendees arrive, the host picks a game and the number of active players. The selected game determines how many seats are available. If there are more attendees than seats, the extra people can watch rather than being removed from the room.",
        ],
      },
      {
        heading: "Make your game night smoother",
        paragraphs: [
          "Keep the lobby open while everyone joins, then confirm the game and player setup before starting. If the group wants a different game, the host can change the selection from the lobby.",
          "If your connection drops during an active online match, use Connect in the game room or the saved Rejoin button on the home page to return to the same seat while the room is still open. Text chat helps coordinate turns. Voice or video features may ask for browser permission, and a stable network helps online connections work reliably.",
        ],
      },
    ],
    faqs: [
      {
        question: "Do I need to install anything?",
        answer:
          "No. GamesLord games run in a modern web browser, so you can open the site and start playing without a separate app download.",
      },
      {
        question: "Can I play without inviting anyone?",
        answer:
          "Yes. Choose Play vs computer to play one side against the computer, or User vs User to take turns with another person on the same device.",
      },
      {
        question: "What happens when a lobby has extra attendees?",
        answer:
          "The host sets the active player count. Attendees who do not take a player seat can watch the game, and voice chat is offered when there are spectators.",
      },
      {
        question: "Can I rejoin a game after leaving?",
        answer:
          "If your connection drops during a game, use Connect in the room to rejoin as the same player while it is still open. The home page also offers a Rejoin button for your most recent online game; hosts can use it to reopen their lobby with the same room code and game selected.",
      },
    ],
    related: [
      { href: "/online-multiplayer", label: "Learn about online multiplayer" },
      { href: "/games/tic-tac-toe", label: "Try a quick Tic-Tac-Toe game" },
    ],
  },
};

const pagePaths: Record<SeoPageId, string> = {
  "privacy-policy": "/privacy-policy",
  chess: "/games/chess",
  "tic-tac-toe": "/games/tic-tac-toe",
  "snakes-and-ladders": "/games/snakes-and-ladders",
  "online-multiplayer": "/online-multiplayer",
  "how-to-play": "/how-to-play",
};

const legacyGamePages: SeoPageId[] = ["chess", "tic-tac-toe", "snakes-and-ladders"];
const gameGuideLinks = [
  { href: "/games/chess", label: "Play Chess Online" },
  { href: "/games/tic-tac-toe", label: "Play Tic-Tac-Toe Online" },
  { href: "/games/snakes-and-ladders", label: "Play Snakes & Ladders Online" },
  ...GAME_SEO_IDS.map((game) => ({
    href: `/games/${game}`,
    label: gamePages[game].title,
  })),
];

export function isGameSeoPage(page: string): page is GameSeoPageId {
  return Object.prototype.hasOwnProperty.call(gamePages, page);
}

function getSeoPageContent(page: SeoRoutePageId) {
  return isGameSeoPage(page) ? gamePages[page] : pages[page];
}

function getSeoPagePath(page: SeoRoutePageId) {
  return isGameSeoPage(page) ? `/games/${page}` : pagePaths[page];
}

export function seoHead(page: SeoRoutePageId) {
  const { title, description } = getSeoPageContent(page);
  const canonical = canonicalUrl(getSeoPagePath(page));
  const socialImage = "https://gameslord.online/playora/logo/gameslord-social-preview.png";
  return {
    meta: [
      { title: `${title} | GamesLord` },
      { name: "description", content: description },
      { name: "robots", content: "index,follow" },
      { property: "og:title", content: `${title} | GamesLord` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:image", content: socialImage },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "GamesLord - online multiplayer games, made for fun" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: `${title} | GamesLord` },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: socialImage },
      { name: "twitter:image:alt", content: "GamesLord - online multiplayer games, made for fun" },
    ],
    links: canonical ? [{ rel: "canonical", href: canonical }] : [],
  };
}

export function SeoPage({ page }: { page: SeoRoutePageId }) {
  const content = getSeoPageContent(page);
  const pageUrl = canonicalUrl(getSeoPagePath(page));
  const homeUrl = canonicalUrl("/");
  const siteOperator = import.meta.env.VITE_PUBLIC_SITE_OPERATOR?.trim();
  const privacyEmail = import.meta.env.VITE_PUBLIC_PRIVACY_EMAIL?.trim();
  const isGamePage =
    isGameSeoPage(page) || legacyGamePages.includes(page as SeoPageId);
  const structuredData = pageUrl && homeUrl
    ? [
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: homeUrl },
            {
              "@type": "ListItem",
              position: 2,
              name: page === "privacy-policy" ? "Privacy policy" : "Game guides",
              item: page === "privacy-policy" ? pageUrl : `${homeUrl}#game-guides`,
            },
            { "@type": "ListItem", position: 3, name: content.title, item: pageUrl },
          ],
        },
        ...(isGamePage
          ? [
              {
                "@context": "https://schema.org",
                "@type": "VideoGame",
                name: content.title,
                description: content.description,
                url: pageUrl,
                gamePlatform: "Web browser",
                applicationCategory: "Game",
                operatingSystem: "Web browser",
              },
            ]
          : []),
      ]
    : [];

  return (
    <div className="seo-page">
      {structuredData.map((schema) => (
        <script
          key={schema["@type"]}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
          }}
        />
      ))}
      <header className="seo-header">
        <a className="brand" href="/" aria-label="GamesLord home">
          <img className="brand-mark" src="/playora/logo/gameslord-logo-dark.svg" alt="GamesLord" />
        </a>
        <nav aria-label="Main navigation">
          <a href="/#games">Games</a>
          <a href={page === "privacy-policy" ? "/privacy-policy" : "/#game-guides"}>
            {page === "privacy-policy" ? "Privacy" : "Guides"}
          </a>
          <a href="/online-multiplayer">Online play</a>
        </nav>
        <a className="btn primary" href="/#games">Explore games</a>
      </header>

      <main className="seo-main">
        <nav className="seo-breadcrumbs" aria-label="Breadcrumb">
          <a href="/">Home</a><span aria-hidden="true">/</span>
          {page === "privacy-policy" ? null : <><a href="/#game-guides">Guides</a><span aria-hidden="true">/</span></>}
          <span aria-current="page">{content.title}</span>
        </nav>
        <article>
          <header className="seo-hero">
            <p className="seo-kicker">{page === "privacy-policy" ? "SITE INFORMATION" : "GAMESLORD GUIDE"}</p>
            <h1>{content.title}</h1>
            <p>{content.intro}</p>
            {page !== "privacy-policy" ? (
              <a className="btn primary" href={content.playHref ?? "/#games"}>
                {content.playHref ? "Play this game" : "Browse games"} <span aria-hidden="true">↗</span>
              </a>
            ) : null}
          </header>
          <div className="seo-article">
            {content.sections.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {page === "privacy-policy" &&
                section.heading === "Cookies, advertising and third parties" ? (
                  <p>
                    Read about{" "}
                    <a href="https://policies.google.com/technologies/ads" rel="noreferrer">
                      how Google uses data when you use partner sites
                    </a>{" "}
                    and review your{" "}
                    <a href="https://adssettings.google.com/" rel="noreferrer">
                      Google ad settings
                    </a>
                    .
                  </p>
                ) : null}
              </section>
            ))}
            {content.faqs.length ? (
              <section className="seo-faq" aria-labelledby="faq-heading">
                <h2 id="faq-heading">Frequently asked questions</h2>
                {content.faqs.map((faq) => (
                  <details key={faq.question}>
                    <summary>{faq.question}</summary>
                    <p>{faq.answer}</p>
                  </details>
                ))}
              </section>
            ) : null}
            {page === "privacy-policy" ? (
              <section aria-labelledby="privacy-contact-heading">
                <h2 id="privacy-contact-heading">Site operator and privacy contact</h2>
                <p>Last updated: October 25, 2026</p>
                <p>{siteOperator || "The GamesLord site operator has not yet been identified in deployment settings."}</p>
                {privacyEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(privacyEmail) ? (
                  <p>
                    Privacy questions: <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>
                  </p>
                ) : (
                  <p>
                    A privacy contact email has not been configured. The site operator should add one before
                    enabling advertising.
                  </p>
                )}
              </section>
            ) : null}
          </div>
          {page !== "privacy-policy" ? <AdSenseSlot placement="guide" /> : null}
        </article>
      </main>
      <footer className="seo-footer">
        <a className="brand" href="/" aria-label="GamesLord home"><img className="brand-mark" src="/playora/logo/gameslord-logo-dark.svg" alt="GamesLord" /></a>
        <p>Free browser games to play solo or with friends.</p>
        <div className="seo-footer-link-groups">
          <nav aria-label="Site pages"><ul><li><a href="/">Home</a></li><li><a href="/#game-guides">All guides</a></li><li><a href="/how-to-play">How to play</a></li><li><a href="/online-multiplayer">Online multiplayer</a></li><li><a href="/privacy-policy">Privacy policy</a></li></ul></nav>
          <nav aria-label="Game guides"><h2>Game guides</h2><div className="seo-footer-guide-lists">{Array.from({ length: 4 }, (_, column) => <ul key={column}>{gameGuideLinks.filter((_, index) => index % 4 === column).map((item) => <li key={item.href}><a href={item.href}>{item.label.replace(/^Play /, "").replace(/ Online$/, "")}</a></li>)}</ul>)}</div></nav>
        </div>
      </footer>
    </div>
  );
}
