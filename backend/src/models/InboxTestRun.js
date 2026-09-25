import mongoose from "mongoose";
const schema = new mongoose.Schema({ report: mongoose.Schema.Types.Mixed }, { timestamps: true });
export default mongoose.model("InboxTestRun", schema);
