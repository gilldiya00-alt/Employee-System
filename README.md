# Employee Management System

## Run locally on Windows

Run these commands from the repository root in separate PowerShell terminals.

1. Make sure `.env` contains the database connection, secret key, admin
   credentials, and manager credentials required by `src/utlis/settings.py`.
2. Start the API:

   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```

3. Create the initial admin account using the credentials configured in `.env`:

   ```powershell
   .\.venv\Scripts\python.exe create_admin.py
   ```

   The command is safe to rerun: it leaves an existing admin account unchanged.
   If you can’t sign in to an existing account, reset its password
   interactively (the password is not displayed or included in shell history):

   ```powershell
   .\.venv\Scripts\python.exe reset_account_password.py
   ```

   Enter the account email and choose a new password between 8 and 72
   characters. Then sign in using that email and the new password. This only
   resets an existing account; it does not create one.
4. Start the frontend:

   ```powershell
   .\.venv\Scripts\python.exe -m http.server 5500 --directory frontend --bind 127.0.0.1
   ```

Open the UI at [http://localhost:5500/](http://localhost:5500/). The API
documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs).
