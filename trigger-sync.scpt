tell application "Obsidian" to activate
delay 1
tell application "System Events"
	tell process "Obsidian" to set frontmost
	-- Open command palette
	keystroke "p" using {command down}
	delay 1
	keystroke return
	delay 2
	-- Wait for palette to appear
	delay 1
	-- Type the command name character by character
	keystroke "F"
	delay 0.1
	keystroke "e"
	delay 0.1
	keystroke "i"
	delay 0.1
	keystroke "s"
	delay 0.1
	keystroke "h"
	delay 0.1
	keystroke "u"
	delay 0.1
	keystroke ":"
	delay 0.1
	keystroke " "
	delay 0.1
	keystroke "S"
	delay 0.1
	keystroke "y"
	delay 0.1
	keystroke "n"
	delay 0.1
	keystroke "c"
	delay 0.1
	keystroke " "
	delay 0.1
	keystroke "a"
	delay 0.1
	keystroke "l"
	delay 0.1
	keystroke "l"
	delay 1
	-- Press enter to execute
	keystroke return
	delay 3
	-- Close command palette
	keystroke "escape"
end tell
