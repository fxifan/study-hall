# Friends, direct messages and group invites

Owner sign-off on the mockup, 7 Nov 2026 (`study-hall/design-preview/add-friend-dms.html`).

## What students can do

- **Username:** pick a unique `@username` on Me, or on Friends the first time. 3–20 characters, lowercase letters, numbers, dots and underscores; it can change once every 30 days. Others still see "Mia T.".
- **Add a friend:** type their exact username on Friends (`?add=` also works, so "Copy link" shares `/student/friends?add=mia.studies`). The result shows their name, badge and how many groups you share before you tap Add. Requests wait for the other person; adding someone who already asked you accepts.
- **Messages:** accepted friends appear under Messages on Friends, newest first with an unread dot. A conversation lives at `/student/messages/<profile id>`; new messages arrive live. The Friends tab shows a dot for new requests, unread messages or group invites.
- **Group invites:** from a conversation's Options, invite a friend into one of your groups they're not in. It appears as a card in the chat and on their Groups page; they join only by tapping Join.

## Rules (`src/lib/social/friends.ts`, checked again in every action)

- No browsing, search or suggestions: exact username only. Someone you may not connect with looks the same as nobody.
- Only accepted friends can message or invite each other. Removing a friend or blocking ends that and cancels pending invites; blocking works both ways.
- An adult (18+) and an under-18 can only become friends if they already share a group. Unknown birth dates count as under 18.
- Limits: 20 friend requests and 10 group invites a day, 15 messages a minute, 1000 characters, text only.
- A group invite needs the inviter to still be in the group and still be friends when it's accepted, and the group to have room (12).
- A moderator's chat pause covers direct messages too. Messages can be reported (⋯ next to a message); reports appear on the admin Edumi page with Hide, Hide and pause chat, or No action.

## Data (`supabase/migrations/20261107004031_friends_dms.sql`)

`students.username` (unique), `direct_messages` (pair `a < b`, kind `text` or `invite`), `dm_reads`, `group_friend_invites`, `dm_reports`. Students read only their own rows under RLS; all writes go through the server. `direct_messages` is in the Realtime publication, so RLS limits each subscriber to their own conversations.

## Models we followed

Discord (unique usernames separate from display names, exact-match add, accept to connect), Steam/Discord friend links, Duolingo (mutual friends for shared goals), and the teen defaults of Instagram Teen Accounts and Snapchat (no stranger discovery; messages only between connected people).

## Tests

- Unit: `src/lib/social/usernames.test.ts` (format, blocked words, normalising, the 18+ rule).
- Database: `tests/rls/friends-dms.test.ts` (students read only their own conversations, invites and reads; nobody can write directly).
- Browser: `tests/e2e/friends.spec.ts` (username, add by username, accept, message live, invite to a group and join, block ends the chat, adult/under-18 rule, report reaches admin).
