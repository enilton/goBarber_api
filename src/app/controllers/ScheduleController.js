import { parseISO, startOfDay, endOfDay } from "date-fns";
import { Op } from "sequelize";
import Appointment from "../models/Appointment";
import User from "../models/User";

class ScheduleController {
  async index(req, res) {
    const checkUserProvider = await User.findOne({
      where: { id: req.user_Id, provider: true },
    });

    if (!checkUserProvider) {
      return res.status(401).json({ error: "User is not a provider " });
    }

    const { date } = req.query;
    const parsedDate = parseISO(date);

    const appointments = Appointment.findAll({
      where: {
        provider_id: req.userId,
        canceled_at: null,
        date: {
          [Op.between]: [startOfDay(parsedDate), endOfDay(parsedDate)],
        },
      },
    });

    return res.json(appointments);
  }
}

export default new ScheduleController();
