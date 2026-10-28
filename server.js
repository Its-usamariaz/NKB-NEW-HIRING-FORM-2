
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = process.env.PORT || 3000;
const FLOW_URL = process.env.POWER_AUTOMATE_URL;

// Adds working submission functionality to your existing HTML.
const submissionScript = `
<script>
(() => {
  const form = document.getElementById("application");
  const success = document.getElementById("success");
  const button = form.querySelector('[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (!form.reportValidity()) return;

    const application = Object.fromEntries(
      new FormData(form).entries()
    );

    button.disabled = true;
    button.textContent = "Submitting...";

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(application)
      });

      if (!response.ok) {
        throw new Error("Submission failed");
      }

      form.style.display = "none";
      success.style.display = "block";

      const demoMessage = success.querySelector("p[style]");
      if (demoMessage) demoMessage.remove();

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });

    } catch (error) {
      alert(
        "Unable to submit your application. Please try again."
      );
    } finally {
      button.disabled = false;
      button.textContent = "Submit";
    }
  }, true);
})();
</script>
`;

function respond(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

const fields = [
  "fullName",
  "countryCode",
  "mobile",
  "email",
  "age",
  "city",
  "postalCode",
  "experience",
  "spanishProficiency",
  "relocation",
  "interviewDate",
  "interviewTime",
  "startDate",
  "source",
  "referralName",
  "otherSource"
];

const requiredFields = [
  "fullName",
  "mobile",
  "email",
  "age",
  "city",
  "postalCode",
  "experience",
  "spanishProficiency",
  "relocation",
  "interviewDate",
  "interviewTime",
  "startDate",
  "source"
];

http.createServer(async (req, res) => {

  // Serve the original hiring form.
  if (
    req.method === "GET" &&
    (req.url === "/" || req.url === "/index.html")
  ) {
    try {
      let html = await fs.readFile(
        path.join(__dirname, "index.html"),
        "utf8"
      );

      html = html.replace(
        "</body>",
        submissionScript + "</body>"
      );

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
      });

      res.end(html);
    } catch (error) {
      console.error("HTML loading error:", error.message);
      respond(res, 500, { error: "Unable to load form" });
    }
    return;
  }

  // Receive the application and send it to Power Automate.
  if (
    req.method === "POST" &&
    req.url === "/api/submit"
  ) {
    if (!FLOW_URL) {
      respond(res, 503, {
        error: "Power Automate URL is not configured"
      });
      return;
    }

    try {
      let rawBody = "";

      for await (const chunk of req) {
        rawBody += chunk.toString();

        if (rawBody.length > 20000) {
          respond(res, 413, {
            error: "Application is too large"
          });
          return;
        }
      }

      const input = JSON.parse(rawBody);
      const application = {};

      for (const field of fields) {
        application[field] =
          input[field] == null
            ? ""
            : String(input[field]).trim();
      }

      const missing = requiredFields.some(
        field => !application[field]
      );

      if (missing) {
        respond(res, 400, {
          error: "Please complete all required fields"
        });
        return;
      }

      if (
        (application.source === "Referral" &&
          !application.referralName) ||
        (application.source === "Other" &&
          !application.otherSource)
      ) {
        respond(res, 400, {
          error: "Please complete the source information"
        });
        return;
      }

      const flowResponse = await fetch(FLOW_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(application),
        signal: AbortSignal.timeout(30000)
      });

      if (!flowResponse.ok) {
        console.error(
          "Power Automate error:",
          flowResponse.status
        );

        respond(res, 502, {
          error: "Power Automate rejected the application"
        });
        return;
      }

      respond(res, 200, {
        success: true
      });

    } catch (error) {
      console.error("Submission error:", error.message);

      respond(res, 500, {
        error: "Application could not be submitted"
      });
    }
    return;
  }

  respond(res, 404, {
    error: "Not found"
  });

}).listen(PORT, "0.0.0.0", () => {
  console.log(
    "NKB Hiring Form running on port " + PORT
  );
});
