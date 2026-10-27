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

type SeoPageContent = {
  title: string;
  description: string;
  intro: string;
  playHref?: string;
  sections: { heading: string; paragraphs: string[] }[];
  faqs: { question: string; answer: string }[];
  related: { href: string; label: string }[];
};

const pages: Record<SeoPageId, SeoPageContent> = {
  "privacy-policy": {
    title: "Privacy Policy",
    description:
      "Learn what information Playora handles for browser games, online lobbies, voice and video, and optional advertising.",
    intro:
      "This policy explains the information handled when you use Playora, including online multiplayer, device permissions and optional advertising.",
    sections: [
      {
        heading: "Information used to run the site",
        paragraphs: [
          "You can play local games without creating a Playora account. If you join an online lobby, the service processes the room code, a temporary player identifier, the display name you provide, and WebRTC connection-signaling messages needed to connect players. Signaling messages are intended to expire after about 60 seconds, and inactive lobby records are intended to expire after about 30 seconds; periodic cleanup can make actual deletion later.",
          "Game moves and chat are exchanged between participants through the online game connection and are not intended to be stored as a game history by Playora. Your browser may store the most recent room details locally so you can use the rejoin feature. You can clear this information using your browser's site-data controls.",
        ],
      },
      {
        heading: "Camera, microphone and online connections",
        paragraphs: [
          "Voice and video are optional. The browser asks for permission before Playora can access your camera or microphone. Media is sent to other participants over WebRTC; when a direct connection cannot be established, a TURN relay provider may relay the connection. You can deny permission or turn off your camera and microphone in the game controls or browser settings.",
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
          "This policy may be updated when Playora's features, providers or legal requirements change. The site operator is identified below using the public deployment settings. This general information is not legal advice; the operator should review it for the jurisdictions and services in which the site is offered.",
        ],
      },
    ],
    faqs: [],
    related: [],
  },
  chess: {
    title: "Play Chess Online",
    description:
      "Play Chess in your browser on Playora. Start a local game against the computer or create an online lobby and invite a friend.",
    playHref: "/?play=chess#games",
    intro:
      "Chess is a two-player strategy game where every move changes the position and the plans available to both sides. Playora lets you start a game in your browser, practice locally against the computer, or invite someone to an online lobby.",
    sections: [
      {
        heading: "How a Chess game works",
        paragraphs: [
          "One player controls the white pieces and the other controls the black pieces. White moves first, then both sides take turns moving one piece at a time. Each piece has its own pattern of movement, so learning those patterns is the first step toward planning a safe position.",
          "The goal is checkmate: attack the opposing king in a way that leaves no legal move to escape. Capturing pieces can help, but protecting your king and coordinating your pieces matter just as much.",
        ],
      },
      {
        heading: "Start a game on Playora",
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
      { href: "/how-to-play", label: "Getting started with Playora" },
    ],
  },
  "tic-tac-toe": {
    title: "Play Tic-Tac-Toe Online",
    description:
      "Play Tic-Tac-Toe free in your browser. Practice against the computer on one device or invite a friend to a Playora online lobby.",
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
          "Select Tic-Tac-Toe from the Playora games list. You can choose the local computer option for a one-device game, or create an online lobby and share the room code or invitation link with a friend.",
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
        question: "Is Playora Tic-Tac-Toe free?",
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
      { href: "/how-to-play", label: "Getting started with Playora" },
    ],
  },
  "snakes-and-ladders": {
    title: "Play Snakes & Ladders Online",
    description:
      "Play Snakes & Ladders in your browser on Playora. Roll the die, race up ladders and down snakes, or invite a friend to your lobby.",
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
          "Open Snakes & Ladders from the Playora games list. Select local play against the computer for a game on one device, or create an online lobby and invite friends with a room code or a shareable link.",
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
      "Create a Playora game lobby, share an invite link or room code, choose active players and let friends join online from their browsers.",
    intro:
      "Playora makes it easy to bring a group together for browser games. The host creates a lobby first, shares a link or room code, and chooses the game after friends arrive. Attendees who are not playing can watch.",
    sections: [
      {
        heading: "Create a lobby and invite friends",
        paragraphs: [
          "Choose a game and select the online lobby option. Once the room is ready, copy its invitation link or room code and send it to your group. Friends can open the link or enter the code from Playora’s join screen.",
          "Wait for attendees to connect before choosing the game setup. The host controls the game selection and the number of active players, so the group can decide who will play and who would rather watch.",
        ],
      },
      {
        heading: "Players and viewers share one room",
        paragraphs: [
          "A game may need fewer active players than the number of people who want to join the call. In that case, the host can assign the available player seats and let the remaining attendees spectate. Spectators stay in the lobby and can follow the same match.",
          "Playora currently supports up to eight total attendees in a room. The number of active seats depends on the selected game: Chess and Tic-Tac-Toe use two, while other games may allow more. The host can change the game from the lobby.",
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
        question: "How do I invite someone to a Playora game?",
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
          "A Playora room currently supports up to eight attendees total, including the host. The active player count is set for the selected game.",
      },
    ],
    related: [
      { href: "/how-to-play", label: "Step-by-step Playora instructions" },
      { href: "/games/chess", label: "Play Chess with a friend" },
    ],
  },
  "how-to-play": {
    title: "How to Play Online Games",
    description:
      "Learn how to play Playora games: challenge the computer, take turns with a friend on one device, or create an online lobby and invite friends.",
    intro:
      "Playora is a browser-based game room for quick solo sessions and online game nights. Use this guide to choose a game, start locally or invite friends, and understand how player seats and viewers work.",
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
          "No. Playora games run in a modern web browser, so you can open the site and start playing without a separate app download.",
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

export function seoHead(page: SeoPageId) {
  const { title, description } = pages[page];
  const canonical = canonicalUrl(pagePaths[page]);
  return {
    meta: [
      { title: `${title} | Playora` },
      { name: "description", content: description },
      { name: "robots", content: "index,follow" },
    ],
    links: canonical ? [{ rel: "canonical", href: canonical }] : [],
  };
}

export function SeoPage({ page }: { page: SeoPageId }) {
  const content = pages[page];
  const pageUrl = canonicalUrl(pagePaths[page]);
  const homeUrl = canonicalUrl("/");
  const siteOperator = import.meta.env.VITE_PUBLIC_SITE_OPERATOR?.trim();
  const privacyEmail = import.meta.env.VITE_PUBLIC_PRIVACY_EMAIL?.trim();
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
        ...(page === "chess" || page === "tic-tac-toe" || page === "snakes-and-ladders"
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
        <a className="brand" href="/" aria-label="Playora home">
          <span className="logo" aria-hidden="true">P</span>
          Playora<span className="gradient">.</span>
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
            <p className="seo-kicker">{page === "privacy-policy" ? "SITE INFORMATION" : "PLAYORA GUIDE"}</p>
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
                <p>{siteOperator || "The Playora site operator has not yet been identified in deployment settings."}</p>
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
        {content.related.length ? (
          <aside className="seo-related" aria-labelledby="related-heading">
            <h2 id="related-heading">Keep exploring</h2>
            <div>{content.related.map((item) => <a key={item.href} href={item.href}>{item.label}<span aria-hidden="true">↗</span></a>)}</div>
          </aside>
        ) : null}
      </main>
      <footer className="seo-footer">
        <a className="brand" href="/">Playora<span className="gradient">.</span></a>
        <p>Free browser games to play solo or with friends.</p>
        <div><a href="/#game-guides">All guides</a><a href="/how-to-play">How to play</a><a href="/online-multiplayer">Online multiplayer</a><a href="/privacy-policy">Privacy policy</a></div>
      </footer>
    </div>
  );
}
