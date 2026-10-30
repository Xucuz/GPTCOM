module.exports=(req,res)=>{res.setHeader('Cache-Control','no-store');res.status(200).json({ready:false})};
