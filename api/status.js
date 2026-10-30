module.exports=(req,res)=>{res.setHeader('Cache-Control','no-store');res.status(200).json({ready:Boolean(process.env.GEMINI_API_KEY),provider:'Gemini'})};
