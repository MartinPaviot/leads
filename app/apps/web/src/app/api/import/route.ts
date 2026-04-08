import { db } from "@/db";
import { companies, contacts, importHistory } from "@/db/schema";
import { getAuthContext } from "@/lib/auth-utils";
import { eq } from "drizzle-orm";
import Papa from "papaparse";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // File size limit: 5MB
  const MAX_SIZE = 5 * 1024 * 1024;
  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_SIZE) {
    return Response.json(
      { error: "File too large. Maximum size is 5MB." },
      { status: 413 }
    );
  }

  try {
    let csvText: string;
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      const csvData = body.csvData ?? body.csv_data ?? body.csv;
      if (!csvData || typeof csvData !== "string") {
        return Response.json(
          { error: "Missing csvData in JSON body" },
          { status: 400 }
        );
      }
      if (csvData.length > MAX_SIZE) {
        return Response.json(
          { error: "CSV data too large. Maximum size is 5MB." },
          { status: 413 }
        );
      }
      csvText = csvData;
    } else {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return Response.json({ error: "No file provided" }, { status: 400 });
      }

      if (file.size > MAX_SIZE) {
        return Response.json(
          { error: "File too large. Maximum size is 5MB." },
          { status: 413 }
        );
      }

      csvText = await file.text();
    }
    const { data, errors } = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim().toLowerCase(),
    });

    if (errors.length > 0) {
      return Response.json(
        { error: "CSV parse error", details: errors.slice(0, 5) },
        { status: 400 }
      );
    }

    const rows = data as Record<string, string>[];

    if (rows.length === 0) {
      return Response.json({ error: "CSV is empty" }, { status: 400 });
    }

    if (rows.length > 10000) {
      return Response.json(
        { error: "CSV exceeds 10,000 row limit" },
        { status: 400 }
      );
    }

    // Map columns — flexible matching
    const findCol = (row: Record<string, string>, ...names: string[]) => {
      for (const name of names) {
        const key = Object.keys(row).find(
          (k) => k.toLowerCase().replace(/[_ ]/g, "") === name.toLowerCase().replace(/[_ ]/g, "")
        );
        if (key && row[key]) return row[key].trim();
      }
      return null;
    };

    let created = 0;
    let skipped = 0;
    const companyCache = new Map<string, string>();

    for (const row of rows) {
      const email = findCol(row, "email", "emailaddress", "emailaddresses", "contactemail", "contactemails");
      const firstName = findCol(row, "firstname", "first_name", "first name", "name");
      const lastName = findCol(row, "lastname", "last_name", "last name");
      const companyName = findCol(row, "company", "companyname", "company_name", "account", "accountname");
      const title = findCol(row, "title", "jobtitle", "job_title", "job title", "role");
      const phone = findCol(row, "phone", "phonenumber", "phone_number");
      const linkedin = findCol(row, "linkedin", "linkedinurl", "linkedin_url", "linkedin url");
      const notes = findCol(row, "notes", "memo", "description", "comment");

      if (!firstName && !email) {
        skipped++;
        continue;
      }

      // Create or find company
      let companyId: string | null = null;
      if (companyName) {
        const cached = companyCache.get(companyName.toLowerCase());
        if (cached) {
          companyId = cached;
        } else {
          const [company] = await db
            .insert(companies)
            .values({
              name: companyName,
              tenantId: authCtx.tenantId,
            })
            .onConflictDoNothing()
            .returning();

          if (company) {
            companyId = company.id;
            companyCache.set(companyName.toLowerCase(), company.id);
          }
        }
      }

      // Create contact
      await db.insert(contacts).values({
        firstName: firstName || null,
        lastName: lastName || null,
        email: email || null,
        title: title || null,
        phone: phone || null,
        linkedinUrl: linkedin || null,
        companyId,
        tenantId: authCtx.tenantId,
        properties: notes ? { notes } : {},
      });

      created++;
    }

    // Log import history
    await db.insert(importHistory).values({
      tenantId: authCtx.tenantId,
      userId: authCtx.appUserId,
      fileName: "csv_import",
      recordType: "contacts",
      totalRows: rows.length,
      createdCount: created,
      skippedCount: skipped,
      companiesCreated: companyCache.size,
      status: "completed",
    });

    return Response.json({
      success: true,
      created,
      skipped,
      total: rows.length,
      companiesCreated: companyCache.size,
    });
  } catch (error) {
    console.error("Import failed:", error);
    return Response.json({ error: "Import failed" }, { status: 500 });
  }
}
