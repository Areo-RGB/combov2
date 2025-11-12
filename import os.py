import os
import subprocess
import json
import shutil

config_dir = os.path.expanduser("~/.claude")
config_path = os.path.join(config_dir, "settings.json")
backup_path = os.path.join(config_dir, "settings.json.bak")

# Backup original config if it exists
if os.path.exists(config_path):
    shutil.copy2(config_path, backup_path)
else:
    backup_path = None

# Write new config
new_config = {
    "env": {
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-4.5-air",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-4.6",
        "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-4.6"
    }
}
os.makedirs(config_dir, exist_ok=True)
with open(config_path, "w") as f:
    json.dump(new_config, f, indent=2)

# Set environment variables
os.environ["ANTHROPIC_AUTH_TOKEN"] = "0edd6ac0d13243a4ab35a45f07cd9bae.k7HmDIBphgWHb1L7"
os.environ["ANTHROPIC_BASE_URL"] = "https://api.z.ai/api/anthropic"

# Run the command
subprocess.run("claude --dangerously-skip-permissions", shell=True)

# Restore original config
if backup_path and os.path.exists(backup_path):
    shutil.move(backup_path, config_path)
elif backup_path is None:
    os.remove(config_path)