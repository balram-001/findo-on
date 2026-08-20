import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { companyName, city, gstin } = await request.json();

    // Generate a consistent dummy GSTIN based on company name
    const stateCode = "23"; // Madhya Pradesh / Indore
    const dummyPan = "AABCB" + Math.floor(1000 + Math.random() * 9000) + "C";
    const generatedGst = gstin && gstin !== "N/A" ? gstin : `${stateCode}${dummyPan}1Z5`;

    // Simulate short network delay for real feel
    await new Promise((resolve) => setTimeout(resolve, 600));

    return NextResponse.json({
      success: true,
      source: "dummy_generator",
      data: {
        gstin: generatedGst,
        legalName: companyName || "Sample Enterprise Pvt Ltd",
        tradeName: companyName || "Sample Enterprise",
        status: "Active",
        taxpayerType: "Regular",
        registrationDate: "12/04/2018",
        location: city || "Indore",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}