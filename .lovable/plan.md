# Torre de Controle: ajustes

## Answers to your two questions

### Hidden costs of switching to a Grupo Silva link (item 1)
- **Every link sent to leads changes.** The reminders (DataCrazy webhook), the AI SDR and the SDRs' manual messages would send our link, not the Meet link. Anything that still sends the raw Meet link won't be tracked.
- **If our site goes down, the lead can't get in.** Today the lead goes straight to Google. With our link, there's one more step in the way.
- **"Clicou" doesn't mean "is in the waiting room".** It only means the lead opened the link. The lead might give up before asking to join.
- **Previews and bots.** WhatsApp opens the link to build a preview, which could count as a click. This needs a filter.
- **Upside:** if the closer changes, the same link starts pointing to the new room. This fixes the "too many links in the chat" problem.
- **Suggestion:** do this in a separate phase, after you confirm the reminders can send the new link.

### Load from the DataCrazy calls (items 2 and 3)
- The calls only happen while the Torre is open. That's one query every 30 seconds for the meetings in that hour, about 20 to 40 leads, and only on the server.
- The system and its database stay just as fast. The rest of the app isn't affected.
- The only risk is DataCrazy's own request limits. To avoid it, results are saved for 30 seconds and shared between everyone with the panel open. Five managers with the panel open = the same number of calls as one.

## What gets built now

### Item 4: everyone on the team counts as team (approved)
- Besides closers, **any system user with an @ogruposilva.com.br email** counts as team: managers, moderators, SDRs.
- The official Google name for these users is filled in in the background, from the spreadsheet you sent. Names shown in the system don't change.
- A junior closer who joins someone else's meeting to learn **counts as team, not as the lead**. Confirmed: all 22 active closers already have their official name filled in.
- The name-matching rule stays as it is today (first name + surnames that are part of the official name). The yellow dot for identical names stays too.

### Items 2 and 3: DataCrazy research (first step)
1. Look up DataCrazy's conversations/messages API and test it with the key we already have.
2. If there's a way to find the lead's conversation by phone number:
   - **Item 3:** "Abrir no CRM" opens that exact conversation, not the search results page.
   - **Item 2:** a red dot with a counter on the button when the lead has sent a message you haven't read.
3. If the API doesn't provide this, I'll come back to you with what's possible before building anything.

### Item 1: waiting room
- Depends on your go-ahead after reading the hidden costs above. It's not part of this step.

## Technical details
- New `google_name` column (nullable) on `profiles`, filled in by matching emails against the CSV (`/mnt/user-uploads/...`). `meet-presenca` loads `closers.google_name` plus `profiles.google_name` where `active`.
- `google-callback` also saves `profiles.google_name` when the user connects Google.
- New `datacrazy-conversas` function (or an extra action in the proxy): receives phone numbers, returns `{conversationId, naoLidas}`. In-memory cache of 30s per phone. Called by the Torre every 30s only while it's open.
