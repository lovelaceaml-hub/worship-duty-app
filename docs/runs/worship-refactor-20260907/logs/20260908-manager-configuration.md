# Department manager configuration

Root applied the exact owner-specified manager groups to app/settings.departmentManagers. Aggregate preflight found ten departments, twelve distinct managers, and zero identities missing from the current member roster. The Firestore transaction preserved all other settings and created a provider-only prior-map backup under _adminConfigurationBackups. Immediate read-back matched all ten arrays.

Backup operation: af9c3a4e-e7b4-4182-8f25-c9e877cf8725. No names, credentials, or record payloads were saved locally. Existing passcodes and name selection remain the access model; this is not stronger verified authentication. Historical title correction remains separate and has not executed.
