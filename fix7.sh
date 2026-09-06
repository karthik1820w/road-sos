#!/bin/bash
sed -i -e '806,812c\
        let reportUrl = "";\
        try {\
          if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {\
            const { data: uploadData, error: uploadError } = await supabase.storage\
              .from("reports")\
              .upload(`${reportId}.pdf`, pdfData, { contentType: "application/pdf" });\
            if (!uploadError) {\
              const { data: { signedUrl } } = await supabase.storage\
                .from("reports")\
                .createSignedUrl(`${reportId}.pdf`, 12 * 60 * 60);\
              reportUrl = signedUrl;\
            }\
          }\
          if (!reportUrl) {\
            reportStore.set(reportId, pdfData);\
            setTimeout(() => reportStore.delete(reportId), 12 * 60 * 60 * 1000);\
            const hostUrl = `${req.headers["x-forwarded-proto"] || req.protocol}://${req.get("host")}`;\
            reportUrl = `${hostUrl}/api/report/${reportId}.pdf`;\
          }\
          const client = getTwilio();\
' api/index.ts
