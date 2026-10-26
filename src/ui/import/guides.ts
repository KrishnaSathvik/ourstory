/** Step-by-step export instructions per platform (as of late 2026). */
export interface Guide {
  id: string
  platform: string
  name: string
  steps: string[]
  result: string
  tip?: string
}

export const GUIDES: Guide[] = [
  {
    id: 'whatsapp-ios',
    platform: 'whatsapp',
    name: 'WhatsApp · iPhone',
    steps: ['Open the chat.', 'Tap their name at the top.', 'Scroll down and tap Export Chat.', 'Choose Without Media.', 'Save to Files, or AirDrop it to your computer.'],
    result: 'A .zip file (with _chat.txt inside). Drop the zip as it is.',
    tip: '“Without Media” is faster and Duet never looks at photos anyway.',
  },
  {
    id: 'whatsapp-android',
    platform: 'whatsapp',
    name: 'WhatsApp · Android',
    steps: ['Open the chat.', 'Tap ⋮, then More, then Export chat.', 'Choose Without media.', 'Save the file or send it to yourself.'],
    result: 'A .txt file named “WhatsApp Chat with …”.',
    tip: 'If you both export the same chat from your own phones, add both: duplicates are counted once.',
  },
  {
    id: 'instagram',
    platform: 'instagram',
    name: 'Instagram',
    steps: [
      'Settings → Accounts Center → Your information and permissions.',
      'Download your information → Download or transfer information.',
      'Pick your Instagram account → Some of your information → Messages.',
      'Download to device. Set Format to JSON (not HTML) and Date range to All time.',
      'Wait for Instagram’s notification, then download the .zip.',
    ],
    result: 'A .zip file. Drop the whole thing. Duet only opens the message files and ignores everything else.',
    tip: 'Instagram can take from minutes to a couple of days to prepare the file.',
  },
  {
    id: 'messenger',
    platform: 'messenger',
    name: 'Messenger',
    steps: [
      'Facebook Settings → Accounts Center → Your information and permissions.',
      'Download your information → choose your Facebook profile → Messages.',
      'Format: JSON. Date range: All time.',
      'Download the .zip when it’s ready.',
    ],
    result: 'A .zip file. Drop it as it is.',
    tip: 'End-to-end encrypted chats are exported separately from Messenger’s “Download secure storage data”.',
  },
  {
    id: 'telegram',
    platform: 'telegram',
    name: 'Telegram',
    steps: ['Open Telegram Desktop (the computer app).', 'Open the chat, click ⋮ → Export chat history.', 'Untick photos, videos and files.', 'Format: Machine-readable JSON → Export.'],
    result: 'A folder with result.json inside. Drop result.json (or the folder).',
  },
  {
    id: 'imessage',
    platform: 'imessage',
    name: 'iMessage',
    steps: [
      'Apple doesn’t offer an export button, so you’ll need a Mac with Messages in iCloud turned on.',
      'Install the free, open-source imessage-exporter (github.com/ReagentX/imessage-exporter). It also runs locally.',
      'In Terminal: imessage-exporter -f txt -o ~/Desktop/imessages',
      'Find the .txt file for your conversation.',
    ],
    result: 'One .txt file per conversation. Drop the one you want.',
    tip: 'The export folder contains all your chats, so only drop the one you mean to.',
  },
  {
    id: 'discord',
    platform: 'discord',
    name: 'Discord',
    steps: ['Use the open-source DiscordChatExporter.', 'Export your direct-message channel as JSON.'],
    result: 'A .json file. Drop it.',
    tip: 'This is a third-party tool. Read its documentation and Discord’s terms before using it.',
  },
  {
    id: 'sms',
    platform: 'sms',
    name: 'SMS · Android',
    steps: ['Install “SMS Backup & Restore”.', 'Back up messages to a local XML file.', 'Copy the .xml to your computer.'],
    result: 'An .xml file. Duet splits it by contact, and you choose the right one next.',
  },
]
