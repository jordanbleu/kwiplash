class MessageWriter {

    /**
     * Writes out the lines for your message with style
     */
    static writeLines(lines) {
        var msgArray = new Array();
        // this is the emojified logo
        msgArray.push(":regional_indicator_k: :regional_indicator_w: :regional_indicator_i: :regional_indicator_p: :regional_indicator_l: :regional_indicator_a: :regional_indicator_s: :regional_indicator_h: \n");

        lines.forEach(line => {
            msgArray.push(line);
        });
    
        return msgArray.join("");
    }

}

module.exports = {MessageWriter};






