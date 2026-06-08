import subprocess

# Generate bcrypt hash inside the container's /app directory where node_modules exist
script = "const bcrypt = require('bcrypt'); bcrypt.hash('Admin@123', 12).then(hash => console.log(hash));"

# Write script into the container
subprocess.run(['docker', 'exec', 'crm-api', 'sh', '-c', f'echo \'{script}\' > /app/genhash.js'], capture_output=True, text=True)

# Run it from /app where bcrypt is available
result = subprocess.run(['docker', 'exec', '-w', '/app', 'crm-api', 'node', 'genhash.js'], capture_output=True, text=True)
print("HASH:", result.stdout.strip())

if result.stdout.strip():
    new_hash = result.stdout.strip()
    # Update all users passwords
    sql = f"UPDATE users SET password_hash = '{new_hash}';"
    result2 = subprocess.run(['docker', 'exec', 'crm-postgres', 'psql', '-U', 'postgres', '-d', 'crm', '-c', sql], capture_output=True, text=True)
    print("UPDATE:", result2.stdout.strip())
    print("ERRORS:", result2.stderr.strip() if result2.stderr else "none")
else:
    print("STDERR:", result.stderr)
