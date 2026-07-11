eval "$(/opt/homebrew/bin/brew shellenv)"

export PNPM_HOME="/Users/alpox/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac


# Added by Toolbox App
export PATH="$PATH:/Users/alpox/Library/Application Support/JetBrains/Toolbox/scripts"


# Added by Obsidian
export PATH="$PATH:/Applications/Obsidian.app/Contents/MacOS"
